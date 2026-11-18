-- Just enough of Supabase (roles, auth schema, extensions) to run our migrations + SQL tests on a plain Postgres.
-- Used by scripts/test-db-local.sh. Not applied to real projects.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema extensions;
create extension pgcrypto schema extensions;
create schema auth;
create table auth.users (id uuid primary key, phone text, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', aud text, role text, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$
  select current_setting('request.jwt.claims', true)::jsonb->>'role' $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
-- 2-step sign-in: verified authenticator apps (only the columns our SQL reads).
create table auth.mfa_factors (id uuid primary key, user_id uuid not null references auth.users(id), friendly_name text, factor_type text, status text,
  created_at timestamptz default now(), updated_at timestamptz default now(), secret text);
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
