#!/usr/bin/env bash
# Nightly: copy the LIVE database, restore the copy into an empty Postgres, and prove nothing was lost
# (every table in the salon data has the same number of rows in the copy as on live).
# Usage: LIVE_DB_URL=... RESTORE_DB_URL=... scripts/backup-restore-test.sh <out-file>
# Optional: BACKUP_PASSPHRASE → the copy is also saved encrypted (<out-file>.gpg) for 14 days.
set -euo pipefail
: "${LIVE_DB_URL:?LIVE_DB_URL is not set}" "${RESTORE_DB_URL:?RESTORE_DB_URL is not set}"
OUT=${1:-backup.dump}
q() { psql "$1" -X -q -t -A -v ON_ERROR_STOP=1 -c "$2"; }

echo "1/4 copy live (salon data = public schema + sign-in ids)"
pg_dump "$LIVE_DB_URL" -Fc --no-owner --no-privileges --schema=public -f "$OUT"
q "$LIVE_DB_URL" "copy (select id from auth.users) to stdout" > users.csv
ls -lh "$OUT"

echo "2/4 empty database shaped like Supabase (roles, auth.users, auth.uid)"
psql "$RESTORE_DB_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth; create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table if not exists auth.users (id uuid primary key, email text, phone text);
create or replace function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$;
create or replace function auth.jwt() returns jsonb language sql stable as $f$ select '{}'::jsonb $f$;
SQL
psql "$RESTORE_DB_URL" -X -q -c "\copy auth.users(id) from 'users.csv'"

echo "3/4 restore the copy"
pg_restore -d "$RESTORE_DB_URL" --no-owner --no-privileges "$OUT" 2> restore.log || true
echo "restore notes: $(grep -c 'error' restore.log || true) (extension/grant notes are expected)"

echo "4/4 compare row counts, table by table"
tables=$(q "$LIVE_DB_URL" "select tablename from pg_tables where schemaname='public' order by 1")
bad=0; n=0
for t in $tables; do
  a=$(q "$LIVE_DB_URL" "select count(*) from public.\"$t\"")
  b=$(q "$RESTORE_DB_URL" "select count(*) from public.\"$t\"" 2>/dev/null || echo missing)
  n=$((n+1))
  if [ "$a" != "$b" ]; then echo "::error::$t live=$a restored=$b"; bad=$((bad+1)); fi
done
if [ "$bad" -gt 0 ]; then echo "RESTORE TEST FAILED: $bad of $n tables differ"; cat restore.log | tail -40; exit 1; fi
echo "RESTORE TEST OK: $n tables, every row count matches"

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -c -o "$OUT.gpg" "$OUT"
  echo "encrypted copy: $OUT.gpg"
fi
rm -f users.csv
