# Tenure Pilot Runbook

Live URL: https://d1n6mdis7bs02g.cloudfront.net · AWS account `154932391697` (us-east-1)

## Onboarding a real institution

1. **Institution + OSE staff.** Adapt `scripts/seed.mjs` (or run the same Prisma calls
   from a one-off script): create the `Institution` (name, slug, email `domain`),
   the OSE users, and their `InstitutionMembership` rows (`OSE_DIRECTOR` / `OSE_STAFF`).
2. **Clubs and seats.** For each club: `Organization` (slug is the URL), then `Role`
   seats — one `PRESIDENT`, functional VP seats, one `MEMBER` role.
3. **People.** Create `User` rows with real university emails and `RoleAssignment`s:
   `ACTIVE` for current holders, `SHADOW` for incoming leaders. Do not backfill
   ALUMNI unless the history matters on day one.
4. **Auth.** Real logins require Okta:
   - Create an Okta OIDC app (redirect URI: `https://<domain>/api/auth/callback/okta`).
   - Put `OKTA_CLIENT_ID`, `OKTA_CLIENT_SECRET`, `OKTA_ISSUER` into Secrets Manager
     secret `tenure-pilot/app` (console → edit the JSON keys, they already exist).
   - Set `AUTH_DEV_LOGIN` to `"false"` in `infrastructure/terraform/ecs.tf` and deploy.
     **The demo picker must be off before real data enters the system.**
5. **Domain.** Point a real domain at CloudFront (ACM cert in us-east-1 + alias in
   `cloudfront.tf`), update `NEXTAUTH_URL` in `ecs.tf`.

## Routine operations

| Task | How |
|---|---|
| Deploy | Push to `main` — CI (48 unit + 32 e2e tests) gates, version verified live |
| Diagnose prod | Actions → **Debug Logs** workflow → ECS events + container log heads |
| Rotate auth secret | Actions → **Rotate Auth Secret** workflow (invalidates sessions) |
| DB access | RDS is VPC-only; connect via a bastion or `aws ecs execute-command` |
| Metrics | CloudWatch dashboard `tenure-pilot-ops`; alarms on 5xx, task count, RDS CPU, DLQ |

## Security posture (Week 8 review)

- **AuthN:** NextAuth v5, JWT sessions, `trustHost` behind CloudFront/ALB.
  Pilot dev-login is ON for demos — see step 4 above before real rollout.
- **AuthZ:** every server action re-checks permissions server-side
  (`src/lib/rbac.ts`, `memory.ts`, `messaging.ts`, `approvals.ts`); denials are
  audit-logged and surface on `/reports`.
- **Secrets:** Secrets Manager (app bundle + RDS-managed DB password), injected
  at task start; nothing in the repo. `ANTHROPIC_API_KEY` via GitHub secret →
  Terraform var.
- **Data:** RDS encrypted, deletion protection + final snapshot on; S3 documents
  SSE-AES256, private, presigned 10-min downloads; append-only `AuditEvent` and
  `ApprovalStep` trails.
- **Transport:** TLS at CloudFront (min TLSv1.2), HSTS + nosniff + frame-deny +
  referrer-policy headers app-wide.
- **AI:** the model receives only content the requesting user can already see;
  answers must cite numbered sources.

## Known pilot limitations

- Schema sync uses `prisma db push --accept-data-loss` at container start —
  fine while data is recreatable; move to versioned `prisma migrate deploy`
  before real institutional data lands.

- Single ECS task (no HA); scale `ecs_desired_count` for production.
- Free-tier account caps RDS backups at 1 day — raise to 7 after upgrading.
- Dev login enabled; Okta pending institution credentials.
- No WAF/rate limiting at the edge yet (add `aws_wafv2_web_acl` when public).
