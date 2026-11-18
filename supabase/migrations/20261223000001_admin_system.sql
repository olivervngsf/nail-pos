-- Founder Admin · System tab (board A6; System Design "Running smooth", issue #22). Admins only (Oliver, Elang). Salons never see it.
-- Real facts from the database: Stripe messages (24 h / 7 days, matched to a ticket), each admin's 2-step login, texting
-- registration per salon. Things the database can't see (backups + restore test, uptime, Sentry, spending alerts) are
-- "Running smooth" checks we tick by hand with a date and a note. Our monthly costs are typed in by hand too.

create table public.platform_checks (
  key text primary key,
  status text not null default 'not_set' check (status in ('ok', 'warn', 'bad', 'not_set')),
  note text not null default '',
  checked_at timestamptz,
  checked_by uuid references auth.users(id)
);
alter table public.platform_checks enable row level security;   -- no policies: only the admin functions below read/write

insert into public.platform_checks (key) values
  ('backups'), ('restore_test'), ('data_walls'), ('sentry'), ('uptime'), ('spending_alerts'), ('secrets'), ('live_db')
on conflict do nothing;

create table public.platform_costs (
  month date not null check (extract(day from month) = 1),
  name text not null check (length(name) between 1 and 60),
  cents bigint not null check (cents >= 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (month, name)
);
alter table public.platform_costs enable row level security;

-- Each admin + whether they turned on 2-step login (Supabase MFA, a verified authenticator app).
create function public._admins_two_step() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  if to_regclass('auth.mfa_factors') is null then   -- local test database: no MFA tables
    select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(p.name, a.note, 'Admin'), 'twoStep', false) order by a.created_at), '[]')
      into out from public.platform_admins a left join public.people p on p.auth_user_id = a.auth_user_id;
    return out;
  end if;
  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(p.name, a.note, 'Admin'),
      'twoStep', exists (select 1 from auth.mfa_factors f where f.user_id = a.auth_user_id and f.status::text = 'verified')) order by a.created_at), '[]')
    from public.platform_admins a left join public.people p on p.auth_user_id = a.auth_user_id $q$ into out;
  return out;
end $$;
revoke execute on function public._admins_two_step() from public, anon, authenticated;

create function public.admin_system() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m date := date_trunc('month', now())::date;
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'now', now(),
    'stripe', jsonb_build_object(
      'day', (select count(*) from public.stripe_events where received_at > now() - interval '24 hours'),
      'week', (select count(*) from public.stripe_events where received_at > now() - interval '7 days'),
      'payWeek', (select count(*) from public.stripe_events where received_at > now() - interval '7 days' and type like 'payment_intent.%'),
      'payMatched', (select count(*) from public.stripe_events where received_at > now() - interval '7 days' and type like 'payment_intent.%' and ticket_id is not null),
      'last', (select max(received_at) from public.stripe_events)),
    'admins', public._admins_two_step(),
    'texting', jsonb_build_object(
      'waiting', (select count(*) from public.admin_salon_status where texting = 'waiting'),
      'waitingNames', coalesce((select jsonb_agg(s.name order by s.name) from public.admin_salon_status x join public.salons s on s.id = x.salon_id
        where x.texting = 'waiting'), '[]'),
      'approved', (select count(*) from public.admin_salon_status where texting = 'approved')),
    'salons', (select count(*) from public.salons where archived_at is null),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('key', c.key, 'status', c.status, 'note', c.note, 'at', c.checked_at,
        'by', (select coalesce(p.name, 'Admin') from public.people p where p.auth_user_id = c.checked_by))) from public.platform_checks c), '[]'),
    'month', m,
    'costs', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'cents', c.cents) order by c.cents desc, c.name)
      from public.platform_costs c where c.month = m), '[]'),
    'lastCosts', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'cents', c.cents) order by c.cents desc, c.name)
      from public.platform_costs c where c.month = (m - interval '1 month')::date), '[]'));
end $$;

-- Tick a Running smooth check (with a note: what we checked, e.g. "restore test done, 2 min").
create function public.admin_check_set(p_key text, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if p_status not in ('ok', 'warn', 'bad', 'not_set') then raise exception 'unknown status'; end if;
  update public.platform_checks set status = p_status, note = left(coalesce(p_note, ''), 300), checked_at = now(), checked_by = (select auth.uid())
  where key = p_key;
  if not found then raise exception 'unknown check'; end if;
end $$;

-- One monthly cost line (null cents = remove it).
create function public.admin_cost_set(p_month date, p_name text, p_cents bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare mo date := date_trunc('month', p_month)::date;
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if p_cents is null then delete from public.platform_costs where month = mo and name = trim(p_name); return; end if;
  insert into public.platform_costs (month, name, cents, updated_by) values (mo, trim(p_name), p_cents, (select auth.uid()))
  on conflict (month, name) do update set cents = excluded.cents, updated_by = excluded.updated_by, updated_at = now();
end $$;

revoke execute on function public.admin_system(), public.admin_check_set(text, text, text), public.admin_cost_set(date, text, bigint) from public, anon;
grant execute on function public.admin_system(), public.admin_check_set(text, text, text), public.admin_cost_set(date, text, bigint) to authenticated;
