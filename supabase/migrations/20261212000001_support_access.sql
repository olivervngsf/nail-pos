-- M14 · Support access (Founder Admin A2/A4/A8, System Design "Founder Admin", issue #21).
-- The owner turns support on for 24 hours. Only then can a platform admin (Oliver, Elang) open the salon's screens.
-- Every change the admin makes is written to audit_log; it ends by itself after 24 h, or when the owner or admin ends it.
-- Without a grant, admins see salon health only (admin_salon, other branch): counts and totals, never client names, phones or tech pay.

create table public.support_grants (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  granted_by uuid references public.people(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  ended_at timestamptz,
  ended_by uuid references auth.users(id),
  reason text not null default ''
);
create index on public.support_grants (salon_id, ends_at desc);
alter table public.support_grants enable row level security;
create policy "owners read" on public.support_grants for select to authenticated using (public.is_admin(salon_id));

-- Is the signed-in person a platform admin inside an open support window for this salon?
create function public._support_on(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.support_grants g
    where g.salon_id = s and g.ended_at is null and g.ends_at > now() and g.starts_at <= now())
    and public.is_platform_admin();
$$;
revoke execute on function public._support_on(uuid) from public, anon;
grant execute on function public._support_on(uuid) to authenticated;

-- The salon wall lets support in only during a grant (same view as the owner).
create or replace function public.is_member(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = s and p.auth_user_id = (select auth.uid()) and m.archived_at is null)
    or public._support_on(s);
$$;
create or replace function public.is_admin(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = s and p.auth_user_id = (select auth.uid()) and m.archived_at is null
      and m.role in ('owner', 'manager'))
    or public._support_on(s);
$$;
create or replace function public._is_desk(p_salon uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = p_salon and p.auth_user_id = (select auth.uid()) and m.archived_at is null
      and m.role in ('owner', 'manager', 'front_desk'))
    or public._support_on(p_salon);
$$;

-- Salons you can open: your memberships + (admins) salons in an open support window, shown as "PolishOS support".
drop function public.my_memberships();
create function public.my_memberships()
returns table (membership_id uuid, salon_id uuid, salon_name text, role public.member_role, display_name text, setup_step smallint,
  has_pin boolean, language text, support_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select * from (
    select m.id, s.id, s.name, m.role, m.display_name, s.setup_step, m.pin_hash is not null, p.language, null::timestamptz
    from public.memberships m join public.salons s on s.id = m.salon_id join public.people p on p.id = m.person_id
    where p.auth_user_id = (select auth.uid()) and m.archived_at is null and s.archived_at is null
    order by (m.role = 'owner') desc, s.created_at
  ) mine
  union all
  select null::uuid, s.id, s.name, 'owner'::public.member_role, 'PolishOS support', s.setup_step, false,
    coalesce((select p.language from public.people p where p.auth_user_id = (select auth.uid())), 'en'), g.ends_at
  from public.support_grants g join public.salons s on s.id = g.salon_id
  where public.is_platform_admin() and g.ended_at is null and g.ends_at > now() and s.archived_at is null
    and not exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
      where m.salon_id = s.id and p.auth_user_id = (select auth.uid()) and m.archived_at is null);
$$;
revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;

-- Owner turns support on (24 h; one open window at a time).
create function public.support_grant(p_salon uuid, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid; g public.support_grants;
begin
  select m.person_id into me from public.memberships m join public.people p on p.id = m.person_id
  where m.salon_id = p_salon and p.auth_user_id = (select auth.uid()) and m.archived_at is null and m.role = 'owner' limit 1;
  if me is null then raise exception 'only the owner can turn on support'; end if;
  update public.support_grants set ended_at = now(), ended_by = (select auth.uid())
  where salon_id = p_salon and ended_at is null and ends_at > now();
  insert into public.support_grants (salon_id, granted_by, ends_at, reason)
  values (p_salon, me, now() + interval '24 hours', left(coalesce(p_reason, ''), 300)) returning * into g;
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (p_salon, me, 'support.on', jsonb_build_object('until', g.ends_at, 'reason', g.reason));
  return jsonb_build_object('id', g.id, 'until', g.ends_at);
end $$;

-- Owner (or the admin helping) ends it now.
create function public.support_end(p_salon uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare owner boolean; n int;
begin
  owner := exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = p_salon and p.auth_user_id = (select auth.uid()) and m.archived_at is null and m.role = 'owner');
  if not owner and not public._support_on(p_salon) then raise exception 'not allowed'; end if;
  update public.support_grants set ended_at = now(), ended_by = (select auth.uid())
  where salon_id = p_salon and ended_at is null and ends_at > now();
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, public.my_person_id(), 'support.off', jsonb_build_object('by', case when owner then 'owner' else 'support' end));
  end if;
end $$;

-- What the owner (and the admin) sees: on/off, time left, and every support step (newest first).
create function public.support_status(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g public.support_grants;
begin
  if not (public.is_admin(p_salon) or public.is_platform_admin()) then raise exception 'not allowed'; end if;
  select * into g from public.support_grants where salon_id = p_salon and ended_at is null and ends_at > now() order by starts_at desc limit 1;
  return jsonb_build_object(
    'on', g.id is not null, 'until', g.ends_at, 'since', g.starts_at, 'reason', g.reason,
    'grantedBy', (select display_name from public.memberships where salon_id = p_salon and person_id = g.granted_by limit 1),
    'log', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'what', a.detail->>'what') order by a.at desc, a.id desc)
      from (select * from public.audit_log where salon_id = p_salon and action like 'support.%' order by at desc, id desc limit 100) a), '[]'::jsonb),
    'past', coalesce((select jsonb_agg(jsonb_build_object('from', x.starts_at, 'to', least(coalesce(x.ended_at, x.ends_at), x.ends_at),
        'ended', case when x.ended_at is not null and x.ended_at < x.ends_at then 'early' else 'timed_out' end) order by x.starts_at desc)
      from (select * from public.support_grants where salon_id = p_salon and (ended_at is not null or ends_at <= now()) order by starts_at desc limit 10) x), '[]'::jsonb));
end $$;

-- Every change an admin makes inside a salon (only possible in support mode) is logged: table + action, no private data.
create function public._support_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old)); sid uuid;
begin
  -- No signed-in user (server jobs, migrations): nothing to log.
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return null; end if;
  if not exists (select 1 from public.platform_admins where auth_user_id = (select auth.uid())) then return null; end if;
  sid := coalesce(r->>'salon_id', case when tg_table_name = 'salons' then r->>'id' end)::uuid;
  if sid is null or not public._support_on(sid) or exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
      where m.salon_id = sid and p.auth_user_id = (select auth.uid()) and m.archived_at is null) then return null; end if;
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (sid, public.my_person_id(), 'support.change', jsonb_build_object('what', tg_table_name || ' ' || lower(tg_op)));
  return null;
end $$;
revoke execute on function public._support_audit() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['salons', 'tickets', 'ticket_lines', 'payments', 'clients', 'appointments', 'services', 'memberships',
      'devices', 'booking_settings', 'loyalty_settings', 'gift_cards', 'card_readers', 'refunds'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists support_audit on public.%I', t);
      execute format('create trigger support_audit after insert or update or delete on public.%I for each row execute function public._support_audit()', t);
    end if;
  end loop;
end $$;

-- Admin list: salons with support on right now (name, until, the owner's reason). Health + activity live in admin_salon.
create function public.admin_support_on() returns table (salon_id uuid, salon_name text, until timestamptz, since timestamptz, reason text)
language sql stable security definer set search_path = '' as $$
  select distinct on (g.salon_id) g.salon_id, s.name, g.ends_at, g.starts_at, g.reason
  from public.support_grants g join public.salons s on s.id = g.salon_id
  where public.is_platform_admin() and g.ended_at is null and g.ends_at > now()
  order by g.salon_id, g.ends_at desc;
$$;

revoke execute on function public.support_grant(uuid, text), public.support_end(uuid), public.support_status(uuid),
  public.admin_support_on() from public, anon;
grant execute on function public.support_grant(uuid, text), public.support_end(uuid), public.support_status(uuid),
  public.admin_support_on() to authenticated;
