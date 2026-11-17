-- Profile, PIN + Settings (board "Nail POS — Profile, PIN + Settings", Nov 17).
--  1. PIN rules per salon (owner picks 6 or 10 digits, wrong-PIN lock, auto-lock). Each PIN remembers its length, so a
--     length change locks nobody out: the old PIN still works once, then the faces screen asks for a new one.
--  2. Every PIN try is logged (who, device, what for, OK / wrong / locked) → Settings · PIN activity.
--  3. Team: add / edit / archive a member with full details; owner-only pay; clear a PIN so they make a new one.
--  4. Devices: list, rename, change job (front desk / time clock / walk-in kiosk), owner signs one out.
--  5. Time clock pay sheet uses pin_earnings (tickets + totals since payout_lines); it now logs its purpose too.
-- Fits the invites_admin migration on the test project (memberships.email may already exist; 'invite' stays reserved).

-- ---------- columns ----------
alter table public.salons add column pin_rules jsonb not null default '{}';
alter table public.memberships
  add column pin_len smallint,
  add column nickname text,
  add column if not exists email text,
  add column birthday text,
  add column emergency text,
  add column skills text[] not null default '{}',
  add column workdays smallint[] not null default '{}',
  add column start_date date;
update public.memberships set pin_len = 4 where pin_hash is not null;

alter table public.devices drop constraint devices_kind_check;
alter table public.devices add constraint devices_kind_check check (kind in ('front_desk', 'clock', 'kiosk', 'owner'));

-- ---------- helpers ----------
create function public._is_owner(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = s and p.auth_user_id = (select auth.uid()) and m.archived_at is null and m.role = 'owner');
$$;

create function public._pin_rules(p_salon uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('length', 6, 'lock_after', 5, 'lock_minutes', 1, 'idle_minutes', 2, 'text_owner', true,
    'ask_discount', true, 'ask_refund', true, 'ask_void', true, 'ask_no_sale', true)
    || coalesce((select s.pin_rules from public.salons s where s.id = p_salon), '{}');
$$;

-- Too easy: wrong length, one digit repeated, or a run like 123456 / 654321 (not checked for 10 digits = phone numbers).
create function public._pin_bad(p text, len int) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or p !~ ('^[0-9]{' || len || '}$') or p ~ '^(.)\1*$'
    or (len < 10 and (strpos('01234567890', p) > 0 or strpos('09876543210', p) > 0));
$$;

-- ---------- PIN check: salon rules + log every try ----------
create or replace function public._check_pin(p_device uuid, p_membership uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.devices; m public.memberships; rules jsonb; lim int; mins int; det jsonb;
  purpose text := coalesce(nullif(current_setting('nailpos.pin_purpose', true), ''), 'unlock');
begin
  select * into d from public.devices where id = p_device and archived_at is null;
  -- A salon device is signed in by an owner/manager (register_device). Staff on their own phones can't try PINs.
  if d.id is null or not public.is_member(d.salon_id)
     or not (public.is_admin(d.salon_id) or d.signed_in_by = public.my_person_id()) then
    return jsonb_build_object('ok', false, 'reason', 'device');
  end if;
  -- Row lock: parallel guesses wait for each other, so every wrong try counts.
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

-- Callers say what the PIN is for (shown in PIN activity).
create or replace function public.pin_unlock(p_device uuid, p_membership uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('nailpos.pin_purpose', 'unlock', true);
  return public._check_pin(p_device, p_membership, p_pin);
end $$;

create or replace function public.pin_clock(p_device uuid, p_membership uuid, p_pin text, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if p_kind not in ('in', 'out') then raise exception 'bad kind'; end if;
  perform set_config('nailpos.pin_purpose', 'clock_' || p_kind, true);
  r := public._check_pin(p_device, p_membership, p_pin);
  if not (r->>'ok')::boolean then return r; end if;
  insert into public.clock_events (salon_id, membership_id, kind, source, device_id) values ((r->>'salon_id')::uuid, p_membership, p_kind, 'pin', p_device);
  return r || jsonb_build_object('kind', p_kind, 'at', now());
end $$;

create or replace function public.pin_earnings(p_device uuid, p_membership uuid, p_pin text, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; sid uuid;
begin
  perform set_config('nailpos.pin_purpose', 'earnings', true);
  r := public._check_pin(p_device, p_membership, p_pin);
  if not (r->>'ok')::boolean then return r; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'pick up to 2 months'; end if;
  sid := (r->>'salon_id')::uuid;
  return r || jsonb_build_object('earnings', (select to_jsonb(x) || jsonb_build_object('lines',
    coalesce((select pl.lines from public._payout_lines(sid, p_from, p_to, p_membership) pl), '[]'))
    from public._payout(sid, p_from, p_to, p_membership) x));
end $$;

create or replace function public.approve_discount(p_salon uuid, p_device uuid default null, p_membership uuid default null, p_pin text default null,
  p_purpose text default 'discount', p_ticket uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; mid uuid; aid uuid;
begin
  if p_purpose not in ('discount', 'refund', 'close', 'client') then raise exception 'bad purpose'; end if;
  if p_purpose = 'refund' and not exists (select 1 from public.tickets where id = p_ticket and salon_id = p_salon) then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;
  if p_device is null then
    if not public.is_admin(p_salon) then return jsonb_build_object('ok', false, 'reason', 'not_manager'); end if;
    select m.id into mid from public.memberships m where m.salon_id = p_salon and m.person_id = public.my_person_id() and m.archived_at is null;
    r := jsonb_build_object('ok', true, 'membership_id', mid, 'name', (select display_name from public.memberships where id = mid));
  else
    perform set_config('nailpos.pin_purpose', 'approve_' || p_purpose, true);
    r := public._check_pin(p_device, p_membership, p_pin);
    if not (r->>'ok')::boolean then return r; end if;
    if (r->>'salon_id')::uuid <> p_salon then return jsonb_build_object('ok', false, 'reason', 'device'); end if;
    if r->>'role' not in ('owner', 'manager') then return jsonb_build_object('ok', false, 'reason', 'not_manager'); end if;
    mid := p_membership;
  end if;
  insert into public.discount_approvals (salon_id, membership_id, device_id, purpose, ticket_id)
    values (p_salon, mid, p_device, p_purpose, case when p_purpose = 'refund' then p_ticket end) returning id into aid;
  return r || jsonb_build_object('approval_id', aid);
end $$;

-- Old PIN once (wrong length after a rule change, or "change my PIN" on the faces screen) → new PIN.
create function public.pin_set_new(p_device uuid, p_membership uuid, p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; len int;
begin
  perform set_config('nailpos.pin_purpose', 'new_pin', true);
  r := public._check_pin(p_device, p_membership, p_old);
  if not (r->>'ok')::boolean then return r; end if;
  len := (public._pin_rules((r->>'salon_id')::uuid)->>'length')::int;
  if public._pin_bad(p_new, len) then return jsonb_build_object('ok', false, 'reason', 'weak', 'length', len); end if;
  update public.memberships set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')), pin_len = len where id = p_membership;
  insert into public.audit_log (salon_id, device_id, action, detail)
    values ((r->>'salon_id')::uuid, p_device, 'pin.changed', jsonb_build_object('membership', p_membership));
  return r || jsonb_build_object('needs_new', false);
end $$;

-- Set my own PIN (staff join, My profile). Length = the salon rule.
create or replace function public.set_my_pin(p_salon uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
declare len int := (public._pin_rules(p_salon)->>'length')::int;
begin
  if public._pin_bad(p_pin, len) then raise exception 'weak pin'; end if;
  update public.memberships set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_len = len, pin_fails = 0, pin_locked_until = null
  where salon_id = p_salon and person_id = public.my_person_id() and archived_at is null;
  if not found then raise exception 'not a member'; end if;
  insert into public.audit_log (salon_id, person_id, action) values (p_salon, public.my_person_id(), 'pin.changed');
end $$;

create or replace function public.admin_set_pin(p_membership uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (select salon_id from public.memberships where id = p_membership); len int;
begin
  if sid is null or not public.is_admin(sid) then raise exception 'not allowed'; end if;
  len := (public._pin_rules(sid)->>'length')::int;
  if public._pin_bad(p_pin, len) then raise exception 'weak pin'; end if;
  update public.memberships set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_len = len, pin_fails = 0, pin_locked_until = null where id = p_membership;
  insert into public.audit_log (salon_id, person_id, action, detail) values (sid, public.my_person_id(), 'pin.reset', jsonb_build_object('membership', p_membership));
end $$;

-- ---------- PIN rules ----------
create function public.pin_rules(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_salon) then raise exception 'not allowed'; end if;
  return public._pin_rules(p_salon);
end $$;

create function public.set_pin_rules(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public._is_owner(p_salon) then raise exception 'only the owner changes PIN rules'; end if;
  v := jsonb_build_object(
    'length', case when (p->>'length')::int in (6, 10) then (p->>'length')::int else 6 end,
    'lock_after', case when (p->>'lock_after')::int in (3, 5, 10) then (p->>'lock_after')::int else 5 end,
    'lock_minutes', case when (p->>'lock_minutes')::int in (1, 5) then (p->>'lock_minutes')::int else 1 end,
    'idle_minutes', case when (p->>'idle_minutes')::int in (1, 2, 5, 10) then (p->>'idle_minutes')::int else 2 end,
    'text_owner', coalesce((p->>'text_owner')::boolean, true),
    'ask_discount', coalesce((p->>'ask_discount')::boolean, true),
    'ask_refund', coalesce((p->>'ask_refund')::boolean, true),
    'ask_void', coalesce((p->>'ask_void')::boolean, true),
    'ask_no_sale', coalesce((p->>'ask_no_sale')::boolean, true));
  update public.salons set pin_rules = v where id = p_salon;
  insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, public.my_person_id(), 'pin.rules', v);
  return v;
end $$;

-- ---------- PIN activity ----------
create function public.pin_activity(p_salon uuid, p_days int default 1)
returns table (at timestamptz, action text, purpose text, person text, role public.member_role, device text)
language sql stable security definer set search_path = '' as $$
  select a.at, a.action, a.detail->>'purpose', coalesce(m.display_name, pe.name), m.role, d.name
  from public.audit_log a
  left join public.memberships m on m.id = (a.detail->>'membership')::uuid
  left join public.people pe on pe.id = a.person_id
  left join public.devices d on d.id = a.device_id
  where a.salon_id = p_salon and public.is_admin(p_salon)
    and a.at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 1), 31)))
    and (a.action like 'pin.%' or a.action like 'desk.%' or a.action like 'device.%' or a.action like 'staff.%')
  order by a.at desc limit 500;
$$;

-- Lock (faces screen) is logged too.
create function public.device_event(p_device uuid, p_membership uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (select salon_id from public.devices where id = p_device and archived_at is null);
begin
  if sid is null or not public.is_member(sid) or p_action not in ('lock') then raise exception 'not allowed'; end if;
  insert into public.audit_log (salon_id, device_id, action, detail)
    values (sid, p_device, 'desk.locked', jsonb_build_object('membership', (select id from public.memberships where id = p_membership and salon_id = sid)));
end $$;

-- ---------- staff lists: + PIN length ----------
drop function public.today_staff(uuid);
create function public.today_staff(p_salon uuid)
returns table (membership_id uuid, display_name text, role public.member_role, joined boolean, has_pin boolean, locked boolean, clocked_in boolean,
  last_clock timestamptz, pin_len smallint)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name, m.role, m.person_id is not null, m.pin_hash is not null, coalesce(m.pin_locked_until > now(), false),
    coalesce(c.kind = 'in', false), c.at, m.pin_len
  from public.memberships m
  left join lateral (select ce.kind, ce.at from public.clock_events ce where ce.membership_id = m.id order by ce.at desc limit 1) c on true
  where m.salon_id = p_salon and m.archived_at is null and public.is_member(p_salon)
  order by (m.role = 'owner') desc, m.role, m.display_name;
$$;

drop function public.desk_staff(uuid);
create function public.desk_staff(p_salon uuid)
returns table (membership_id uuid, display_name text, role public.member_role, clocked_in boolean, turns_today int, cents_today bigint, pin_len smallint)
language sql stable security definer set search_path = '' as $$
  with day as (
    select (date_trunc('day', now() at time zone s.time_zone) at time zone s.time_zone) as start from public.salons s where s.id = p_salon
  )
  select m.id, m.display_name, m.role,
    coalesce((select ce.kind = 'in' from public.clock_events ce where ce.membership_id = m.id order by ce.at desc limit 1), false),
    (select count(distinct l.ticket_id)::int from public.ticket_lines l join public.tickets t on t.id = l.ticket_id
       where l.staff_id = m.id and l.kind = 'service' and l.removed_at is null and t.status <> 'voided' and t.created_at >= (select start from day)),
    (select coalesce(sum(l.amount_cents), 0)::bigint from public.ticket_lines l join public.tickets t on t.id = l.ticket_id
       where l.staff_id = m.id and l.kind = 'service' and l.removed_at is null and t.status = 'paid' and t.created_at >= (select start from day)),
    m.pin_len
  from public.memberships m
  where m.salon_id = p_salon and m.archived_at is null and public.is_member(p_salon)
  order by (m.role = 'tech') desc, m.display_name;
$$;

-- ---------- team ----------
create function public.team_list(p_salon uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'name', m.display_name, 'nickname', m.nickname, 'phone', m.phone, 'email', m.email, 'role', m.role, 'language', m.language,
    'payType', m.pay_type, 'commissionPct', m.commission_pct, 'hourlyCents', m.hourly_cents, 'checkPct', m.check_pct,
    'skills', to_jsonb(m.skills), 'workdays', to_jsonb(m.workdays), 'licenseNo', m.license_no, 'licenseState', m.license_state,
    'licenseExpires', m.license_expires, 'birthday', m.birthday, 'emergency', m.emergency, 'startDate', m.start_date,
    'joined', m.person_id is not null, 'hasPin', m.pin_hash is not null, 'locked', coalesce(m.pin_locked_until > now(), false),
    'clockedIn', coalesce(c.kind = 'in', false), 'lastClock', c.at,
    'invite', (select i.code from public.invites i where i.membership_id = m.id and i.used_at is null and i.expires_at > now() order by i.created_at desc limit 1))
    order by (m.role = 'owner') desc, m.role, m.display_name), '[]'::jsonb)
  from public.memberships m
  left join lateral (select ce.kind, ce.at from public.clock_events ce where ce.membership_id = m.id order by ce.at desc limit 1) c on true
  where m.salon_id = p_salon and m.archived_at is null and public.is_admin(p_salon);
$$;

-- Add or edit a member. Owner only for pay; nobody gives the owner role here; a joined person's phone stays theirs.
create function public.team_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (p->>'salonId')::uuid; mid uuid := nullif(p->>'id', '')::uuid; cur public.memberships;
  own boolean; r public.member_role; ph text := p->>'phone'; code text;
  sk text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'skills', '[]'::jsonb))), '{}');
  wd smallint[] := coalesce(array(select x::smallint from jsonb_array_elements_text(coalesce(p->'workdays', '[]'::jsonb)) x where x ~ '^[0-6]$'), '{}');
begin
  if sid is null or not public.is_admin(sid) then raise exception 'not allowed'; end if;
  own := public._is_owner(sid);
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'name needed'; end if;
  if coalesce(ph, '') !~ '^\+1[0-9]{10}$' then raise exception 'phone needed'; end if;
  if mid is not null then
    select * into cur from public.memberships where id = mid and salon_id = sid and archived_at is null for update;
    if cur.id is null then raise exception 'not found'; end if;
    if cur.role = 'owner' and not own then raise exception 'not allowed'; end if;
  end if;
  r := case when cur.role = 'owner' then 'owner'::public.member_role else (p->>'role')::public.member_role end;
  if r = 'owner' and cur.id is null then raise exception 'not allowed'; end if;
  if r = 'owner' and cur.role is distinct from 'owner' then raise exception 'not allowed'; end if;
  if cur.id is null then
    insert into public.memberships (salon_id, display_name, phone, role, language, nickname, email, birthday, emergency, skills, workdays,
      license_no, license_state, license_expires, start_date, pay_type, commission_pct, hourly_cents, check_pct)
    values (sid, trim(p->>'name'), ph, r, case when p->>'language' = 'vi' then 'vi' else 'en' end,
      nullif(trim(p->>'nickname'), ''), nullif(lower(trim(p->>'email')), ''), nullif(p->>'birthday', ''), nullif(trim(p->>'emergency'), ''), sk, wd,
      nullif(trim(p->>'licenseNo'), ''), nullif(p->>'licenseState', ''), nullif(p->>'licenseExpires', '')::date, nullif(p->>'startDate', '')::date,
      case when own then nullif(p->>'payType', '')::public.pay_type end,
      case when own then nullif(p->>'commissionPct', '')::numeric end,
      case when own then nullif(p->>'hourlyCents', '')::int end,
      case when own then least(greatest(coalesce(nullif(p->>'checkPct', '')::int, 100), 0), 100) else 100 end)
    returning id into mid;
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    insert into public.invites (code, salon_id, membership_id) values (code, sid, mid);
    insert into public.audit_log (salon_id, person_id, action, detail) values (sid, public.my_person_id(), 'staff.added', jsonb_build_object('membership', mid));
  else
    update public.memberships set
      display_name = trim(p->>'name'),
      phone = case when cur.person_id is null then ph else cur.phone end,
      role = r,
      language = case when p->>'language' = 'vi' then 'vi' else 'en' end,
      nickname = nullif(trim(p->>'nickname'), ''), email = nullif(lower(trim(p->>'email')), ''), birthday = nullif(p->>'birthday', ''),
      emergency = nullif(trim(p->>'emergency'), ''), skills = sk, workdays = wd,
      license_no = nullif(trim(p->>'licenseNo'), ''), license_state = nullif(p->>'licenseState', ''),
      license_expires = nullif(p->>'licenseExpires', '')::date, start_date = nullif(p->>'startDate', '')::date,
      pay_type = case when own then nullif(p->>'payType', '')::public.pay_type else cur.pay_type end,
      commission_pct = case when own then nullif(p->>'commissionPct', '')::numeric else cur.commission_pct end,
      hourly_cents = case when own then nullif(p->>'hourlyCents', '')::int else cur.hourly_cents end,
      check_pct = case when own then least(greatest(coalesce(nullif(p->>'checkPct', '')::int, cur.check_pct), 0), 100) else cur.check_pct end
    where id = mid;
    insert into public.audit_log (salon_id, person_id, action, detail) values (sid, public.my_person_id(), 'staff.edited', jsonb_build_object('membership', mid));
  end if;
  return jsonb_build_object('id', mid, 'invite', code);
end $$;

-- New invite code for someone who hasn't joined yet.
create function public.team_invite(p_membership uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; code text;
begin
  select * into m from public.memberships where id = p_membership and archived_at is null;
  if m.id is null or not public.is_admin(m.salon_id) or m.person_id is not null then raise exception 'not allowed'; end if;
  code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into public.invites (code, salon_id, membership_id) values (code, m.salon_id, m.id);
  return code;
end $$;

-- Forgot PIN: clear it (and any lock); they make a new one on their phone (My profile) or from the invite.
create function public.team_clear_pin(p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  select * into m from public.memberships where id = p_membership and archived_at is null;
  if m.id is null or not public.is_admin(m.salon_id) or (m.role = 'owner' and not public._is_owner(m.salon_id)) then raise exception 'not allowed'; end if;
  update public.memberships set pin_hash = null, pin_len = null, pin_fails = 0, pin_locked_until = null where id = m.id;
  insert into public.audit_log (salon_id, person_id, action, detail) values (m.salon_id, public.my_person_id(), 'pin.reset', jsonb_build_object('membership', m.id));
end $$;

-- Remove from the team (kept for history: nothing is deleted).
create function public.team_archive(p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  select * into m from public.memberships where id = p_membership and archived_at is null;
  if m.id is null or not public.is_admin(m.salon_id) or m.role = 'owner' then raise exception 'not allowed'; end if;
  update public.memberships set archived_at = now() where id = m.id;
  insert into public.audit_log (salon_id, person_id, action, detail) values (m.salon_id, public.my_person_id(), 'staff.removed', jsonb_build_object('membership', m.id));
end $$;

-- My own name on this salon (My profile).
create function public.save_my_name(p_salon uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'name needed'; end if;
  update public.memberships set display_name = trim(p_name) where salon_id = p_salon and person_id = public.my_person_id() and archived_at is null;
  if not found then raise exception 'not a member'; end if;
  update public.people set name = trim(p_name) where id = public.my_person_id();
end $$;

-- ---------- devices ----------
create function public.devices_list(p_salon uuid)
returns table (id uuid, name text, kind text, last_seen timestamptz, created_at timestamptz, set_up_by text)
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, d.kind, d.last_seen, d.created_at, p.name
  from public.devices d left join public.people p on p.id = d.signed_in_by
  where d.salon_id = p_salon and d.archived_at is null and public.is_admin(p_salon)
  order by d.last_seen desc nulls last;
$$;

create function public.device_save(p_device uuid, p_name text, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (select salon_id from public.devices where id = p_device and archived_at is null);
begin
  if sid is null or not public.is_admin(sid) then raise exception 'not allowed'; end if;
  if p_kind not in ('front_desk', 'clock', 'kiosk') or coalesce(trim(p_name), '') = '' then raise exception 'bad device'; end if;
  update public.devices set name = trim(p_name), kind = p_kind where id = p_device;
  insert into public.audit_log (salon_id, person_id, device_id, action, detail)
    values (sid, public.my_person_id(), p_device, 'device.changed', jsonb_build_object('kind', p_kind));
end $$;

-- Owner signs a device out (lost, stolen, replaced). It stops working at its next PIN or load.
create function public.device_archive(p_device uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (select salon_id from public.devices where id = p_device and archived_at is null);
begin
  if sid is null or not public._is_owner(sid) then raise exception 'only the owner signs a device out'; end if;
  update public.devices set archived_at = now() where id = p_device;
  insert into public.audit_log (salon_id, person_id, device_id, action) values (sid, public.my_person_id(), p_device, 'device.signed_out');
end $$;

-- Is this device still on? (signed out devices go back to set-up)
create function public.device_status(p_device uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('active', d.archived_at is null, 'kind', d.kind, 'name', d.name, 'rules', public._pin_rules(d.salon_id))
  from public.devices d where d.id = p_device and public.is_member(d.salon_id);
$$;

-- ---------- invite page: PIN length for the join screen ----------
create function public.invite_pin_length(p_code text) returns int
language sql stable security definer set search_path = '' as $$
  select (public._pin_rules(i.salon_id)->>'length')::int from public.invites i where i.code = upper(replace(trim(p_code), '-', ''));
$$;

-- ---------- booking page names that are app pages ----------
create or replace function public._slug_reserved() returns text[] language sql immutable set search_path = '' as $$
  select array['book', 'kiosk', 'setup', 'login', 'today', 'checkout', 'clients', 'calendar', 'settings', 'pay', 'join', 'api', 'admin', 'gift-cards', 'kit', 'paid',
    't', 'r', 'c', 'me', 'close-day', 'salon', 'demo', 'numbers', 'loyalty', 'payouts', 'help', 'invite', 'earnings', 'desk', 'clock', 'go'];
$$;

-- ---------- grants ----------
revoke execute on function public._is_owner(uuid), public._pin_rules(uuid), public._pin_bad(text, int) from public, anon, authenticated;
revoke execute on function public.pin_set_new(uuid, uuid, text, text), public.pin_rules(uuid), public.set_pin_rules(uuid, jsonb),
  public.pin_activity(uuid, int), public.device_event(uuid, uuid, text), public.today_staff(uuid), public.desk_staff(uuid),
  public.team_list(uuid), public.team_save(jsonb), public.team_invite(uuid), public.team_clear_pin(uuid), public.team_archive(uuid),
  public.save_my_name(uuid, text), public.devices_list(uuid), public.device_save(uuid, text, text), public.device_archive(uuid),
  public.device_status(uuid), public.invite_pin_length(text) from public, anon;
grant execute on function public.pin_set_new(uuid, uuid, text, text), public.pin_rules(uuid), public.set_pin_rules(uuid, jsonb),
  public.pin_activity(uuid, int), public.device_event(uuid, uuid, text), public.today_staff(uuid), public.desk_staff(uuid),
  public.team_list(uuid), public.team_save(jsonb), public.team_invite(uuid), public.team_clear_pin(uuid), public.team_archive(uuid),
  public.save_my_name(uuid, text), public.devices_list(uuid), public.device_save(uuid, text, text), public.device_archive(uuid),
  public.device_status(uuid), public.invite_pin_length(text) to authenticated;
grant execute on function public.invite_pin_length(text) to anon;
