FROM node:20-alpine AS base
# openssl is required by Prisma's engines on alpine
RUN apk add --no-cache libc6-compat openssl

# ── deps: install production + dev deps (needed for build) ──────────────────
FROM base AS deps
WORKDIR /app
COPY package*.json ./
# prisma/ must be present: the postinstall hook runs `prisma generate`
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps

# ── prisma-cli: self-contained CLI install for runtime `db push` ────────────
# Cherry-picking CLI deps from the app tree breaks on transitive modules
# (@prisma/debug, effect, ...) — a real npm install gets the complete tree.
FROM base AS prisma-cli
WORKDIR /cli
RUN npm install --no-save --no-audit --no-fund prisma@6

# ── builder: generate Prisma client and build Next.js ───────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (schema must be present, no DB connection needed)
RUN npx prisma generate

# Build Next.js (output: standalone in next.config.ts)
RUN npm run build

# ── runner: minimal production image ────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy standalone server output
COPY --from=builder /app/public                          ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

# Prisma CLI (own dependency tree) + schema + bootstrap scripts: the
# entrypoint runs `db push` + seed against RDS (only reachable in-VPC)
COPY --from=prisma-cli --chown=nextjs:nodejs /cli/node_modules ./prisma-cli/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma  ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs

EXPOSE 3000

# 127.0.0.1, not localhost: busybox wget prefers ::1 but node binds IPv4 only
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["sh", "scripts/entrypoint.sh"]
