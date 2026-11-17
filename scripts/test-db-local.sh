#!/usr/bin/env bash
# Builds a throwaway database on a local Postgres (shim + every migration), then runs the SQL tests.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db-local.sh   (needs psql + node)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=nailpos_test_$$
psql -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/local/shim.sql >/dev/null
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null || { echo "migration failed: $f"; exit 1; }; done
DATABASE_URL="postgres://${PGUSER:-postgres}@localhost/$DB?host=${PGHOST:-/var/run/postgresql}&port=${PGPORT:-5432}" node scripts/test-rls.mjs
