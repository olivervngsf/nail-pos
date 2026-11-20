#!/usr/bin/env bash
# Fails if two files in supabase/migrations share a version (the part before the first "_").
# Why: the live push (scripts/db-push-live.sh) skips by version, so the second file would never run on live.
# Also fails on a file name that doesn't start with a 14-digit version.
set -euo pipefail
cd "$(dirname "$0")/.."
bad=0
for f in supabase/migrations/*.sql; do
  base=$(basename "$f" .sql)
  [[ "$base" =~ ^[0-9]{14}_[a-z0-9_]+$ ]] || { echo "bad migration name: $base (want YYYYMMDDHHMMSS_name.sql)"; bad=1; }
done
dups=$(ls supabase/migrations/*.sql | xargs -n1 basename | cut -d_ -f1 | sort | uniq -d)
for v in $dups; do
  echo "migration version $v is used more than once (give each file its own, later number):"
  ls supabase/migrations/${v}_*.sql | sed 's/^/  /'
  bad=1
done
# Same name twice = the live push (which skips names it already ran) would run only the first.
for n in $(ls supabase/migrations/*.sql | xargs -n1 basename | sed 's/\.sql$//' | cut -d_ -f2- | sort | uniq -d); do
  echo "migration name $n is used more than once (give the new file its own name):"
  ls supabase/migrations/*_"$n".sql | sed 's/^/  /'
  bad=1
done
[ "$bad" = 0 ] && echo "migrations: $(ls supabase/migrations/*.sql | wc -l) files, every version + name unique"
exit "$bad"
