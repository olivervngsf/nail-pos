-- Billing (Nov 18): the salon's PolishOS subscription on OUR platform Stripe account (not the salon's Connect account).
-- Stripe is the truth; this row is a copy the server refreshes (status read, return from Checkout/portal, webhook).
-- Owner + manager read; only the server (service role) writes. Text credit lives in text_credit_* (separate feature).

create table public.salon_billing (
  salon_id uuid primary key references public.salons(id),
  customer_id text unique,
  subscription_id text unique,
  status text not null default 'none',          -- none | trialing | active | past_due | canceled | unpaid | incomplete | incomplete_expired | paused
  cycle text check (cycle in ('monthly', 'yearly')),
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  card_brand text,
  card_last4 text,
  card_exp text,
  updated_at timestamptz not null default now()
);

alter table public.salon_billing enable row level security;
create policy "admins read" on public.salon_billing for select to authenticated using (public.is_admin(salon_id));

-- Owner only (billing changes): same shape as is_admin.
create or replace function public.is_owner(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = s and p.auth_user_id = (select auth.uid()) and m.archived_at is null and m.role = 'owner');
$$;
revoke execute on function public.is_owner(uuid) from public, anon;
grant execute on function public.is_owner(uuid) to authenticated;
