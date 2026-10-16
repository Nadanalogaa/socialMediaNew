#!/bin/sh
# Copies the Neon database into the stack's own Postgres. Run ON THE VPS,
# after the stack is up, before pointing the domain at it:
#
#   NEON_URL='postgresql://neondb_owner:...@ep-....neon.tech/neondb?sslmode=require' \
#   POSTGRES_PASSWORD='...' sh migrate-from-neon.sh
#
# Uses the postgres:18 image's own pg_dump, which matches Neon's server
# version. Safe to re-run: the target schema is dropped and recreated.
set -eu
: "${NEON_URL:?set NEON_URL}"
: "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}"

echo "Dumping Neon…"
docker run --rm postgres:18-alpine \
  pg_dump --no-owner --no-privileges --clean --if-exists "$NEON_URL" > /tmp/neon.sql
echo "Dump: $(wc -c < /tmp/neon.sql) bytes"

echo "Restoring into socialboost-db…"
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" socialboost-db \
  psql -U socialboost -d socialboost -v ON_ERROR_STOP=0 -q < /tmp/neon.sql
rm -f /tmp/neon.sql

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" socialboost-db \
  psql -U socialboost -d socialboost -c "select count(*) as users from users; select count(*) as connections from connections;"
echo "Done. Restart the api container so it reconnects: docker restart socialboost-api socialboost-worker"
