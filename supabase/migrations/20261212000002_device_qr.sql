-- QR device set-up (board 5.4, Nov 18). The owner's phone makes a one-time code; the new tablet opens
-- polishosapp.com/go?c=CODE (camera scan on iPhone/iPad + Android) and gets a login of its own, made by the server.
-- Nobody signs in on the tablet and the owner's account never sits on a shared device.
--  * device_codes: 8 characters, one use, 10 minutes, for one salon + one job (front desk / time clock / walk-in kiosk).
--  * device_logins: the tablet's own auth user → its device. Rights follow the job:
--      front desk = member + desk + manager-level (Settings stay behind an owner/manager PIN in the app),
--      walk-in kiosk = member + desk (check-ins save as bookings), time clock = member only (PINs do the rest).
--    The owner signs a device out (device_archive) and the login loses every right at once.

create table public.device_codes (
  code text primary key,
  salon_id uuid not null references public.salons(id),
  kind text not null check (kind in ('front_desk', 'clock', 'kiosk')),
  name text not null,
  created_by uuid references public.people(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  device_id uuid references public.devices(id)
);
create index on public.device_codes (salon_id, created_at desc);
alter table public.device_codes enable row level security;  -- functions only

create table public.device_logins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  device_id uuid not null unique references public.devices(id),
  created_at timestamptz not null default now()
);
alter table public.device_logins enable row level security;  -- functions only

-- Is the signed-in user a salon device of this salon, doing one of these jobs?
create function public._device_of(s uuid, kinds text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.device_logins dl join public.devices d on d.id = dl.device_id
    where dl.auth_user_id = (select auth.uid()) and d.salon_id = s and d.archived_at is null and d.kind = any (kinds));
$$;

create or replace function public.is_member(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = s and p.auth_user_id = (select auth.uid()) and m.archived_at is null)
    or public._device_of(s, array['front_desk', 'clock', 'kiosk']);
$$;
create or replace function public.is_admin(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = s and p.auth_user_id = (select auth.uid()) and m.archived_at is null
      and m.role in ('owner', 'manager'))
    or public._device_of(s, array['front_desk']);
$$;
create or replace function public._is_desk(p_salon uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = p_salon and p.auth_user_id = (select auth.uid()) and m.archived_at is null
      and m.role in ('owner', 'manager', 'front_desk'))
    or public._device_of(p_salon, array['front_desk', 'kiosk']);
$$;

-- A device login shows up as one salon in "my memberships" (no membership id; the person comes from the faces screen PIN).
create or replace function public.my_memberships()
returns table (membership_id uuid, salon_id uuid, salon_name text, role public.member_role, display_name text, setup_step smallint, has_pin boolean, language text)
language sql stable security definer set search_path = '' as $$
  select x.membership_id, x.salon_id, x.salon_name, x.role, x.display_name, x.setup_step, x.has_pin, x.language from (
    select m.id as membership_id, s.id as salon_id, s.name as salon_name, m.role, m.display_name, s.setup_step, m.pin_hash is not null as has_pin, p.language,
      (m.role = 'owner') as is_owner, s.created_at
    from public.memberships m join public.salons s on s.id = m.salon_id join public.people p on p.id = m.person_id
    where p.auth_user_id = (select auth.uid()) and m.archived_at is null and s.archived_at is null
    union all
    select null::uuid, s.id, s.name, (case when d.kind = 'front_desk' then 'manager' else 'front_desk' end)::public.member_role,
      d.name, s.setup_step, false, 'en', false, s.created_at
    from public.device_logins dl join public.devices d on d.id = dl.device_id join public.salons s on s.id = d.salon_id
    where dl.auth_user_id = (select auth.uid()) and d.archived_at is null and s.archived_at is null
  ) x order by x.is_owner desc, x.created_at;
$$;

-- What this device is (the tablet asks after sign-in and on every start).
create function public.my_device() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', d.id, 'salonId', d.salon_id, 'name', d.name, 'kind', d.kind, 'active', d.archived_at is null)
  from public.device_logins dl join public.devices d on d.id = dl.device_id where dl.auth_user_id = (select auth.uid());
$$;

-- PIN checks: a device's own login may try PINs on itself (time clock and kiosk aren't admins).
create or replace function public._check_pin(p_device uuid, p_membership uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.devices; m public.memberships; rules jsonb; lim int; mins int; det jsonb;
  purpose text := coalesce(nullif(current_setting('nailpos.pin_purpose', true), ''), 'unlock');
begin
  select * into d from public.devices where id = p_device and archived_at is null;
  if d.id is null or not public.is_member(d.salon_id)
     or not (public.is_admin(d.salon_id) or d.signed_in_by = public.my_person_id()
             or exists (select 1 from public.device_logins dl where dl.device_id = d.id and dl.auth_user_id = (select auth.uid()))) then
    return jsonb_build_object('ok', false, 'reason', 'device');
  end if;
  select * into m from public.memberships where id = p_membership and salon_id = d.salon_id and archived_at is null for update;
  if m.id is null then return jsonb_build_object('ok', false, 'reason', 'person'); end if;
  rules := public._pin_rules(d.salon_id);
  lim := greatest(3, least(10, coalesce((rules->>'lock_after')::int, 5)));
  mins := greatest(1, least(60, coalesce((rules->>'lock_minutes')::int, 1)));
  det := jsonb_build_object('membership', m.id, 'purpose', purpose);
  if m.pin_locked_until > now() then
    insert into public.audit_log (salon_id, device_id, action, detail) values (d.salon_id, d.id, 'pin.blocked', det);
    return jsonb_build_object('ok', false, 'reason', 'locked', 'until', m.pin_locked_until);
  end if;
  if m.pin_hash is null then return jsonb_build_object('ok', false, 'reason', 'no_pin'); end if;
  if extensions.crypt(p_pin, m.pin_hash) = m.pin_hash then
    update public.memberships set pin_fails = 0 where id = m.id;
    update public.devices set last_seen = now() where id = d.id;
    insert into public.audit_log (salon_id, device_id, action, detail) values (d.salon_id, d.id, 'pin.ok', det);
    return jsonb_build_object('ok', true, 'membership_id', m.id, 'name', m.display_name, 'role', m.role, 'salon_id', d.salon_id,
      'needs_new', coalesce(m.pin_len, 4) <> (rules->>'length')::int);
  end if;
  if m.pin_fails + 1 >= lim then
    update public.memberships set pin_fails = 0, pin_locked_until = now() + make_interval(mins => mins) where id = m.id;
    insert into public.audit_log (salon_id, device_id, action, detail)
      values (d.salon_id, d.id, 'pin.locked', det || jsonb_build_object('text_owner', rules->'text_owner'));
    return jsonb_build_object('ok', false, 'reason', 'locked', 'until', now() + make_interval(mins => mins), 'minutes', mins);
  end if;
  update public.memberships set pin_fails = pin_fails + 1 where id = m.id;
  insert into public.audit_log (salon_id, device_id, action, detail) values (d.salon_id, d.id, 'pin.wrong', det);
  return jsonb_build_object('ok', false, 'reason', 'wrong', 'tries_left', lim - 1 - m.pin_fails);
end $$;
revoke execute on function public._check_pin(uuid, uuid, text) from public, anon, authenticated;

-- Owner / manager (a real person, not a device) makes a set-up code on their phone.
create function public.device_code_make(p_salon uuid, p_kind text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea; c text; pid uuid := public.my_person_id(); exp timestamptz;
begin
  if pid is null or not exists (select 1 from public.memberships m where m.salon_id = p_salon and m.person_id = pid
      and m.archived_at is null and m.role in ('owner', 'manager')) then
    raise exception 'only the owner or a manager adds a device';
  end if;
  if p_kind not in ('front_desk', 'clock', 'kiosk') or coalesce(trim(p_name), '') = '' then raise exception 'bad device'; end if;
  if (select count(*) from public.device_codes where salon_id = p_salon and used_at is null and expires_at > now()) >= 5 then
    raise exception 'too many open codes; wait 10 minutes';
  end if;
  loop
    b := extensions.gen_random_bytes(8); c := '';
    for i in 0..7 loop c := c || substr(a, 1 + (get_byte(b, i) % length(a)), 1); end loop;
    exit when not exists (select 1 from public.device_codes where code = c);
  end loop;
  insert into public.device_codes (code, salon_id, kind, name, created_by) values (c, p_salon, p_kind, trim(p_name), pid) returning expires_at into exp;
  insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, pid, 'device.code_made', jsonb_build_object('kind', p_kind, 'name', trim(p_name)));
  return jsonb_build_object('code', c, 'expires_at', exp);
end $$;

-- The owner's phone waits for the tablet: still open, used (by which device) or expired.
create function public.device_code_check(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('used', c.used_at is not null, 'expired', c.used_at is null and c.expires_at <= now(),
    'device', (select jsonb_build_object('id', d.id, 'name', d.name, 'kind', d.kind) from public.devices d where d.id = c.device_id))
  from public.device_codes c where c.code = upper(replace(trim(p_code), '-', '')) and public.is_admin(c.salon_id);
$$;

-- Server only (the /api/device/claim route, with the secret key): use the code once, make the device + its login.
create function public._device_claim(p_code text, p_auth_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.device_codes; did uuid;
begin
  select * into c from public.device_codes where code = upper(replace(trim(p_code), '-', '')) for update;
  if c.code is null or c.used_at is not null or c.expires_at <= now() then raise exception 'code not valid'; end if;
  insert into public.devices (salon_id, name, kind, signed_in_by, last_seen) values (c.salon_id, c.name, c.kind, c.created_by, now()) returning id into did;
  insert into public.device_logins (auth_user_id, device_id) values (p_auth_user, did);
  update public.device_codes set used_at = now(), device_id = did where code = c.code;
  insert into public.audit_log (salon_id, person_id, device_id, action, detail)
    values (c.salon_id, c.created_by, did, 'device.registered', jsonb_build_object('via', 'qr', 'kind', c.kind));
  return jsonb_build_object('id', did, 'salonId', c.salon_id, 'name', c.name, 'kind', c.kind,
    'salonName', (select name from public.salons where id = c.salon_id));
end $$;

-- A device login can't change its own job, name or sign itself out (owner/manager on their own login do that).
create or replace function public.device_save(p_device uuid, p_name text, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (select salon_id from public.devices where id = p_device and archived_at is null);
begin
  if sid is null or not public.is_admin(sid) or public.my_person_id() is null then raise exception 'not allowed'; end if;
  if p_kind not in ('front_desk', 'clock', 'kiosk') or coalesce(trim(p_name), '') = '' then raise exception 'bad device'; end if;
  update public.devices set name = trim(p_name), kind = p_kind where id = p_device;
  insert into public.audit_log (salon_id, person_id, device_id, action, detail)
    values (sid, public.my_person_id(), p_device, 'device.changed', jsonb_build_object('kind', p_kind));
end $$;

revoke execute on function public._device_of(uuid, text[]), public._device_claim(text, uuid) from public, anon, authenticated;
grant execute on function public._device_claim(text, uuid) to service_role;
revoke execute on function public.my_device(), public.device_code_make(uuid, text, text), public.device_code_check(text) from public, anon;
grant execute on function public.my_device(), public.device_code_make(uuid, text, text), public.device_code_check(text) to authenticated;
