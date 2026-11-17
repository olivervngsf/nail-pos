-- Session 1: real accounts. Sign-in links a phone to its memberships; setup saves to the database;
-- invites read from the database; PIN on salon devices (hashed, 5 wrong = 5 min lock); clock in/out.
-- Phones are stored +1XXXXXXXXXX. auth.users.phone has no "+".

create table public.clock_events (
  id bigint generated always as identity primary key,
  salon_id uuid not null references public.salons(id),
  membership_id uuid not null references public.memberships(id),
  kind text not null check (kind in ('in', 'out')),
  source text not null check (source in ('pin', 'phone')),
  device_id uuid references public.devices(id),
  by_person uuid references public.people(id),
  at timestamptz not null default now()
);
create index on public.clock_events (salon_id, at desc);
create index on public.clock_events (membership_id, at desc);
alter table public.clock_events enable row level security;
create policy "members read clock" on public.clock_events for select to authenticated using (public.is_member(salon_id));

-- ---------- helpers ----------
create function public._auth_phone() returns text
language sql stable security definer set search_path = '' as $$
  select case when u.phone is null or u.phone = '' then null else '+' || ltrim(u.phone, '+') end
  from auth.users u where u.id = (select auth.uid());
$$;

-- Make sure the signed-in human has a people row; returns its id.
create function public._ensure_person(p_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); ph text := public._auth_phone(); pid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select id into pid from public.people where auth_user_id = uid;
  if pid is not null then
    if p_name is not null and p_name <> '' then update public.people set name = p_name where id = pid and name = ''; end if;
    return pid;
  end if;
  if ph is null then raise exception 'sign in with a phone number'; end if;
  insert into public.people (auth_user_id, phone, name) values (uid, ph, coalesce(nullif(p_name, ''), ''))
  on conflict (phone) do update set auth_user_id = coalesce(public.people.auth_user_id, excluded.auth_user_id)
  returning id into pid;
  return pid;
end $$;

-- After sign-in: link every membership waiting for this phone (invites, test accounts). Returns how many.
create function public.claim_memberships() returns int
language plpgsql security definer set search_path = '' as $$
declare ph text := public._auth_phone(); pid uuid; n int;
begin
  pid := public._ensure_person((select m.display_name from public.memberships m where m.phone = ph and m.archived_at is null limit 1));
  with c as (
    update public.memberships set person_id = pid, user_id = (select auth.uid())
    where phone = ph and person_id is null and archived_at is null returning id, salon_id
  ), i as (
    update public.invites set used_at = now() where membership_id in (select id from c) and used_at is null returning 1
  ), a as (
    insert into public.audit_log (salon_id, person_id, action) select salon_id, pid, 'staff.joined' from c returning 1
  )
  select count(*) into n from c;
  return n;
end $$;

-- My salons and roles.
create function public.my_memberships()
returns table (membership_id uuid, salon_id uuid, salon_name text, role public.member_role, display_name text, setup_step smallint, has_pin boolean, language text)
language sql stable security definer set search_path = '' as $$
  select m.id, s.id, s.name, m.role, m.display_name, s.setup_step, m.pin_hash is not null, p.language
  from public.memberships m join public.salons s on s.id = m.salon_id join public.people p on p.id = m.person_id
  where p.auth_user_id = (select auth.uid()) and m.archived_at is null and s.archived_at is null
  order by (m.role = 'owner') desc, s.created_at;
$$;

-- ---------- setup saves (idempotent: send the whole wizard each time) ----------
create function public.save_setup(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := (p->>'salonId')::uuid;
  pid uuid := public._ensure_person(p->>'ownerName');
  ph text := public._auth_phone();
  h jsonb; sv jsonb; st jsonb; i int := 0;
  keep_services uuid[] := '{}'; keep_staff uuid[] := '{}';
begin
  if sid is null then raise exception 'salonId required'; end if;
  if not exists (select 1 from public.salons where id = sid) then
    insert into public.salons (id, name, state) values (sid, coalesce(nullif(p->>'salonName', ''), 'My salon'), coalesce(p->>'state', 'CA'));
    insert into public.memberships (salon_id, person_id, user_id, display_name, phone, role)
      values (sid, pid, (select auth.uid()), coalesce(nullif(p->>'ownerName', ''), 'Owner'), ph, 'owner');
    insert into public.audit_log (salon_id, person_id, action) values (sid, pid, 'salon.created');
  elsif not public.is_admin(sid) then
    raise exception 'not allowed';
  end if;

  update public.salons set
    name = coalesce(nullif(p->>'salonName', ''), name),
    phone = nullif(p->>'salonPhone', ''),
    address = nullif(p->>'address', ''),
    state = coalesce(p->>'state', state),
    setup_step = greatest(setup_step, coalesce((p->>'step')::smallint, 0))
  where id = sid;

  for h in select * from jsonb_array_elements(coalesce(p->'hours', '[]')) loop
    insert into public.salon_hours (salon_id, weekday, is_open, opens, closes)
    values (sid, i, (h->>'on')::boolean, case when (h->>'on')::boolean then (h->>'open')::time end, case when (h->>'on')::boolean then (h->>'close')::time end)
    on conflict (salon_id, weekday) do update set is_open = excluded.is_open, opens = excluded.opens, closes = excluded.closes;
    i := i + 1;
  end loop;

  if p ? 'services' then
    i := 0;
    for sv in select * from jsonb_array_elements(p->'services') loop
      i := i + 1;
      continue when coalesce(sv->>'name', '') = '' or coalesce((sv->>'minutes')::int, 0) <= 0;
      insert into public.services (id, salon_id, category, name, minutes, price_cents, sort, archived_at)
      values ((sv->>'id')::uuid, sid, coalesce(sv->>'cat', ''), sv->>'name', (sv->>'minutes')::int, greatest(0, (sv->>'priceCents')::int), i,
              case when (sv->>'on')::boolean then null else now() end)
      on conflict (id) do update set category = excluded.category, name = excluded.name, minutes = excluded.minutes,
        price_cents = excluded.price_cents, sort = excluded.sort, archived_at = excluded.archived_at
      where public.services.salon_id = sid;
      keep_services := keep_services || (sv->>'id')::uuid;
    end loop;
    update public.services set archived_at = now() where salon_id = sid and archived_at is null and not (id = any (keep_services));
  end if;

  if p ? 'staff' then
    for st in select * from jsonb_array_elements(p->'staff') loop
      continue when st->>'role' = 'owner' or coalesce(st->>'phone', '') = '';
      insert into public.memberships (id, salon_id, display_name, phone, role, pay_type, commission_pct, hourly_cents)
      values ((st->>'id')::uuid, sid, st->>'name', st->>'phone', (st->>'role')::public.member_role,
              nullif(st->>'payType', '')::public.pay_type, (st->>'commissionPct')::numeric, (st->>'hourlyCents')::int)
      on conflict (id) do update set display_name = excluded.display_name, phone = excluded.phone, role = excluded.role,
        pay_type = excluded.pay_type, commission_pct = excluded.commission_pct, hourly_cents = excluded.hourly_cents
      where public.memberships.salon_id = sid and public.memberships.role <> 'owner';
      if coalesce(st->>'inviteCode', '') <> '' then
        insert into public.invites (code, salon_id, membership_id) values (st->>'inviteCode', sid, (st->>'id')::uuid) on conflict (code) do nothing;
      end if;
      keep_staff := keep_staff || (st->>'id')::uuid;
    end loop;
    update public.memberships set archived_at = now()
    where salon_id = sid and archived_at is null and role <> 'owner' and not (id = any (keep_staff)) and person_id is null;
  end if;
  return sid;
end $$;

-- ---------- invites (readable by anyone holding the code) ----------
create function public.get_invite(p_code text)
returns table (salon_name text, display_name text, role public.member_role, owner_name text, phone_last4 text, status text)
language sql stable security definer set search_path = '' as $$
  select s.name, m.display_name, m.role,
    (select o.display_name from public.memberships o where o.salon_id = s.id and o.role = 'owner' order by o.created_at limit 1),
    right(m.phone, 4),
    case when i.used_at is not null or m.person_id is not null then 'used' when i.expires_at < now() then 'expired' else 'open' end
  from public.invites i join public.memberships m on m.id = i.membership_id join public.salons s on s.id = i.salon_id
  where i.code = upper(p_code) and m.archived_at is null;
$$;

-- ---------- PIN ----------
create function public._weak_pin(p text) returns boolean language sql immutable as $$
  select p !~ '^[0-9]{4}$' or p in ('1234', '4321', '1212', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999');
$$;

-- Set my own PIN for a salon (staff join).
create function public.set_my_pin(p_salon uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public._weak_pin(p_pin) then raise exception 'weak pin'; end if;
  update public.memberships set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_fails = 0, pin_locked_until = null
  where salon_id = p_salon and person_id = public.my_person_id() and archived_at is null;
  if not found then raise exception 'not a member'; end if;
end $$;

-- Owner/manager sets or resets someone's PIN (also clears a lock).
create function public.admin_set_pin(p_membership uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (select salon_id from public.memberships where id = p_membership);
begin
  if sid is null or not public.is_admin(sid) then raise exception 'not allowed'; end if;
  if public._weak_pin(p_pin) then raise exception 'weak pin'; end if;
  update public.memberships set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_fails = 0, pin_locked_until = null where id = p_membership;
  insert into public.audit_log (salon_id, person_id, action, detail) values (sid, public.my_person_id(), 'pin.reset', jsonb_build_object('membership', p_membership));
end $$;

-- Checks a PIN on a salon device. 5 wrong = locked 5 minutes. Never raises, so the fail count is kept.
create function public._check_pin(p_device uuid, p_membership uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.devices; m public.memberships;
begin
  select * into d from public.devices where id = p_device and archived_at is null;
  if d.id is null or not public.is_member(d.salon_id) then return jsonb_build_object('ok', false, 'reason', 'device'); end if;
  select * into m from public.memberships where id = p_membership and salon_id = d.salon_id and archived_at is null;
  if m.id is null then return jsonb_build_object('ok', false, 'reason', 'person'); end if;
  if m.pin_locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'until', m.pin_locked_until); end if;
  if m.pin_hash is null then return jsonb_build_object('ok', false, 'reason', 'no_pin'); end if;
  if extensions.crypt(p_pin, m.pin_hash) = m.pin_hash then
    update public.memberships set pin_fails = 0 where id = m.id;
    update public.devices set last_seen = now() where id = d.id;
    return jsonb_build_object('ok', true, 'membership_id', m.id, 'name', m.display_name, 'role', m.role, 'salon_id', d.salon_id);
  end if;
  if m.pin_fails + 1 >= 5 then
    update public.memberships set pin_fails = 0, pin_locked_until = now() + interval '5 minutes' where id = m.id;
    insert into public.audit_log (salon_id, device_id, action, detail) values (d.salon_id, d.id, 'pin.locked', jsonb_build_object('membership', m.id));
    return jsonb_build_object('ok', false, 'reason', 'locked', 'until', now() + interval '5 minutes');
  end if;
  update public.memberships set pin_fails = pin_fails + 1 where id = m.id;
  return jsonb_build_object('ok', false, 'reason', 'wrong', 'tries_left', 4 - m.pin_fails);
end $$;

create function public.pin_unlock(p_device uuid, p_membership uuid, p_pin text) returns jsonb
language sql security definer set search_path = '' as $$ select public._check_pin(p_device, p_membership, p_pin); $$;

-- ---------- salon devices ----------
create function public.register_device(p_salon uuid, p_name text, p_kind text default 'front_desk') returns uuid
language plpgsql security definer set search_path = '' as $$
declare did uuid;
begin
  if not public.is_admin(p_salon) then raise exception 'only owner or manager can set up a salon device'; end if;
  insert into public.devices (salon_id, name, kind, signed_in_by, last_seen) values (p_salon, p_name, p_kind, public.my_person_id(), now()) returning id into did;
  insert into public.audit_log (salon_id, person_id, device_id, action) values (p_salon, public.my_person_id(), did, 'device.registered');
  return did;
end $$;

-- ---------- clock in / out ----------
create function public.pin_clock(p_device uuid, p_membership uuid, p_pin text, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb := public._check_pin(p_device, p_membership, p_pin);
begin
  if not (r->>'ok')::boolean then return r; end if;
  insert into public.clock_events (salon_id, membership_id, kind, source, device_id) values ((r->>'salon_id')::uuid, p_membership, p_kind, 'pin', p_device);
  return r || jsonb_build_object('kind', p_kind, 'at', now());
end $$;

create function public.clock_self(p_salon uuid, p_kind text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  select id into mid from public.memberships where salon_id = p_salon and person_id = public.my_person_id() and archived_at is null;
  if mid is null then raise exception 'not a member'; end if;
  insert into public.clock_events (salon_id, membership_id, kind, source, by_person) values (p_salon, mid, p_kind, 'phone', public.my_person_id());
  return now();
end $$;

-- Staff list for the desk: who is clocked in right now.
create function public.today_staff(p_salon uuid)
returns table (membership_id uuid, display_name text, role public.member_role, joined boolean, has_pin boolean, locked boolean, clocked_in boolean, last_clock timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name, m.role, m.person_id is not null, m.pin_hash is not null, coalesce(m.pin_locked_until > now(), false),
    coalesce(c.kind = 'in', false), c.at
  from public.memberships m
  left join lateral (select ce.kind, ce.at from public.clock_events ce where ce.membership_id = m.id order by ce.at desc limit 1) c on true
  where m.salon_id = p_salon and m.archived_at is null and public.is_member(p_salon)
  order by (m.role = 'owner') desc, m.role, m.display_name;
$$;

-- ---------- grants ----------
revoke execute on function public._auth_phone(), public._ensure_person(text), public._weak_pin(text), public._check_pin(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_memberships(), public.my_memberships(), public.save_setup(jsonb), public.set_my_pin(uuid, text),
  public.admin_set_pin(uuid, text), public.pin_unlock(uuid, uuid, text), public.register_device(uuid, text, text),
  public.pin_clock(uuid, uuid, text, text), public.clock_self(uuid, text), public.today_staff(uuid), public.get_invite(text) from public, anon;
grant execute on function public.claim_memberships(), public.my_memberships(), public.save_setup(jsonb), public.set_my_pin(uuid, text),
  public.admin_set_pin(uuid, text), public.pin_unlock(uuid, uuid, text), public.register_device(uuid, text, text),
  public.pin_clock(uuid, uuid, text, text), public.clock_self(uuid, text), public.today_staff(uuid), public.get_invite(text) to authenticated;
grant execute on function public.get_invite(text) to anon;
