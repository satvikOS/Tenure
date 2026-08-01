# ── App secrets bundle (injected into ECS task at runtime) ───────────────────
resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name_prefix}/app"
  description             = "Tenure app runtime secrets"
  recovery_window_in_days = 0 # Allow immediate deletion during pilot
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  # Populate with placeholder values; update via AWS console or CLI after deploy
  secret_string = jsonencode({
    AUTH_SECRET        = var.auth_secret != "" ? var.auth_secret : "REPLACE_ME_AFTER_DEPLOY"
    OKTA_CLIENT_ID     = var.okta_client_id
    OKTA_CLIENT_SECRET = var.okta_client_secret
    OKTA_ISSUER        = var.okta_issuer
  })

  lifecycle {
    # Don't overwrite secrets that have been set manually via console
    ignore_changes = [secret_string]
  }
}

# ── IAM policy allowing ECS to read the secret ───────────────────────────────
resource "aws_iam_policy" "ecs_secrets" {
  name = "${local.name_prefix}-ecs-secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.app.arn,
          # Bearer token for scheduled job endpoints
          aws_secretsmanager_secret.job.arn,
          # Interim gate in front of passwordless sign-in (dev-login-gate.tf)
          aws_secretsmanager_secret.dev_login.arn,
          # Deployment manifests delivered by the Tenure engine. Without this the
          # task cannot read the token and ECS fails the container at startup —
          # a rollout loop caused by a secret that exists and is unreadable.
          aws_secretsmanager_secret.reconcile.arn,
          # RDS managed password secret
          "${aws_db_instance.postgres.master_user_secret[0].secret_arn}",
        ]
      }
    ]
  })
}

# ── Deployment manifests from the Tenure engine ──────────────────────────────
#
# The bearer token the engine presents at POST /api/platform/reconcile.
#
# A SEPARATE secret rather than another key in `app` above, and the reason is
# that one's `ignore_changes = [secret_string]`: values there are set by hand
# after deploy, so a key added to its jsonencode is never written. The task
# definition would then reference `:PLATFORM_RECONCILE_SECRET::` inside a JSON
# document that does not contain it, and ECS fails the container at startup —
# a rollout loop caused by a value that looks configured in the code.
#
# This one is managed entirely by Terraform, so what the variable says is what
# the task reads.
resource "aws_secretsmanager_secret" "reconcile" {
  name                    = "${local.name_prefix}/reconcile"
  description             = "Bearer token the Tenure engine presents when delivering a deployment manifest."
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "reconcile" {
  secret_id     = aws_secretsmanager_secret.reconcile.id
  secret_string = var.platform_reconcile_secret
}
