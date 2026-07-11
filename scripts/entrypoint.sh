#!/bin/sh
# Container entrypoint: compose DATABASE_URL, sync schema, seed, start server.
set -e

# DB_CREDS is the RDS-managed master secret: JSON {"username","password"}.
# Compose a proper postgres URL from it plus DB_HOST/DB_PORT/DB_NAME.
if [ -n "$DB_CREDS" ] && [ -n "$DB_HOST" ]; then
  DATABASE_URL=$(node -e '
    const c = JSON.parse(process.env.DB_CREDS);
    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT || "5432";
    const name = process.env.DB_NAME || "tenure";
    const user = encodeURIComponent(c.username);
    const pass = encodeURIComponent(c.password);
    console.log(`postgresql://${user}:${pass}@${host}:${port}/${name}?schema=public&connection_limit=5`);
  ')
  export DATABASE_URL
fi

if [ "$SKIP_DB_BOOTSTRAP" != "true" ] && [ -n "$DATABASE_URL" ]; then
  echo "⏳ Syncing database schema..."
  if node prisma-cli/node_modules/prisma/build/index.js db push --skip-generate --schema prisma/schema.prisma; then
    echo "⏳ Seeding pilot data..."
    node scripts/seed.mjs || echo "⚠️ Seed failed — continuing"
  else
    echo "⚠️ Schema sync failed — starting app anyway"
  fi
fi

exec node server.js
