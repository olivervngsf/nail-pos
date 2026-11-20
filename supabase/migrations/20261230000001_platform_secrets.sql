-- Platform secrets the server makes for itself (Nov 19): e.g. the Stripe billing webhook signing secret, created by
-- Admin → System → "Set up Stripe webhook" with the app's own Stripe key. Server (service role) only: RLS on, no
-- policies, no grants to anon/authenticated. Vercel env vars still win when set.
create table public.platform_secrets (
  name text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_secrets enable row level security;
revoke all on public.platform_secrets from anon, authenticated;
