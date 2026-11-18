#!/usr/bin/env bash
# Bring the LIVE database up to date with supabase/migrations on main.
# - Runs only files the live database hasn't run yet (tracked in supabase_migrations.schema_migrations, Supabase's own list).
# - Each file runs in one transaction: if it fails, nothing from it is kept and we stop (later files don't run).
# - Never touches data from seeds/tests: only the migration files.
# Usage: LIVE_DB_URL=postgres://... scripts/db-push-live.sh [--dry-run]
set -euo pipefail
cd "$(dirname "$0")/.."
: "${LIVE_DB_URL:?LIVE_DB_URL is not set}"
DRY=${1:-}
# Two files with one version = the second never runs here. Stop before touching live.
scripts/check-migrations.sh
q() { psql "$LIVE_DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }

q -c "create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
done_list=$(q -c "select version from supabase_migrations.schema_migrations")

ran=0
for f in supabase/migrations/*.sql; do
  base=$(basename "$f" .sql); version=${base%%_*}; name=${base#*_}
  if grep -qx "$version" <<<"$done_list"; then continue; fi
  if [ "$DRY" = "--dry-run" ]; then echo "would run: $base"; ran=$((ran+1)); continue; fi
  echo "running: $base"
  # One transaction: the file + its row in the list.
  { cat "$f"; printf "\ninsert into supabase_migrations.schema_migrations (version, name) values ('%s', '%s');\n" "$version" "$name"; } \
    | psql "$LIVE_DB_URL" -X -q -1 -v ON_ERROR_STOP=1 >/dev/null || { echo "FAILED: $base (nothing from it was kept; later files not run)"; exit 1; }
  ran=$((ran+1))
done
echo "live database: $ran new migration(s) ${DRY:+(dry run)}"
