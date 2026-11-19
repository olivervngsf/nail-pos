-- Clock-in rules (Nov 19): staff can't clock in from home.
-- The salon picks how a person's OWN phone may clock in (salon devices = time clock tablet / front desk always can):
--   off        = only on salon devices (default)
--   qr         = phone scans the QR on the salon's time clock tablet (changes every 30 s)
--   wifi       = phone must be on the salon's own Wi-Fi (saved by the owner on setup day)
--   qr_or_wifi = either one
-- Phone clock-in only goes through the server (/api/clock/phone → _clock_phone), so the Wi-Fi check uses the
-- internet address the server saw, not what the phone says. Every phone try is logged (ok or refused + why).

alter table public.salons add column if not exists clock_rules jsonb not null default '{"phone": "off"}'::jsonb;
alter table public.clock_events add column if not exists via text;  -- device | qr | wifi | null (older rows)

-- The salon's own internet addresses ("Wi-Fi"). Owners see labels only; the address itself stays on the server.
create table if not exists public.salon_wifi (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  prefix text not null,               -- IPv4 address, or the first half (/64) of an IPv6 address
  label text not null default 'Salon Wi-Fi',
  added_by uuid references public.people(id),
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (salon_id, prefix)
);
alter table public.salon_wifi enable row level security;  -- functions only

-- One secret per salon for the 30-second QR.
create table if not exists public.clock_secrets (
  salon_id uuid primary key references public.salons(id),
  secret bytea not null default extensions.gen_random_bytes(32)
);
alter table public.clock_secrets enable row level security;  -- functions only

create or replace function public._ip_prefix(p_ip text) returns text
language plpgsql immutable set search_path = '' as $$
declare a inet;
begin
  begin a := trim(split_part(coalesce(p_ip, ''), ',', 1))::inet; exception when others then return null; end;
  if family(a) = 6 then return host(network(set_masklen(a, 64))) || '/64'; end if;
  return host(a);
end $$;

create or replace function public._clock_code(p_salon uuid, p_window bigint) returns text
language sql stable security definer set search_path = '' as $$
  select upper(left(encode(extensions.hmac(convert_to(p_salon::text || ':' || p_window::text, 'UTF8'), s.secret, 'sha256'), 'hex'), 10))
  from public.clock_secrets s where s.salon_id = p_salon;
$$;

-- Rules for the salon (any member reads the mode; owners/managers also get the saved Wi-Fi labels).
create or replace function public.clock_rules_get(p_salon uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.is_member(p_salon) then null else
    jsonb_build_object('phone', coalesce(s.clock_rules ->> 'phone', 'off'),
      'wifi', case when public.is_admin(p_salon) then coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'label', w.label, 'added_at', w.added_at) order by w.added_at)
        from public.salon_wifi w where w.salon_id = p_salon and w.removed_at is null), '[]'::jsonb) else null end)
  end from public.salons s where s.id = p_salon;
$$;

-- Owner/manager on their own login changes the mode.
create or replace function public.clock_rules_save(p_salon uuid, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pid uuid := public.my_person_id();
begin
  if pid is null or not exists (select 1 from public.memberships m where m.salon_id = p_salon and m.person_id = pid
      and m.archived_at is null and m.role in ('owner', 'manager')) then
    raise exception 'only the owner or a manager changes clock-in rules';
  end if;
  if p_phone not in ('off', 'qr', 'wifi', 'qr_or_wifi') then raise exception 'bad rule'; end if;
  update public.salons set clock_rules = coalesce(clock_rules, '{}'::jsonb) || jsonb_build_object('phone', p_phone) where id = p_salon;
  insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, pid, 'clock.rules', jsonb_build_object('phone', p_phone));
  return public.clock_rules_get(p_salon);
end $$;

create or replace function public.clock_wifi_remove(p_salon uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pid uuid := public.my_person_id();
begin
  if pid is null or not exists (select 1 from public.memberships m where m.salon_id = p_salon and m.person_id = pid
      and m.archived_at is null and m.role in ('owner', 'manager')) then
    raise exception 'only the owner or a manager changes clock-in rules';
  end if;
  update public.salon_wifi set removed_at = now() where id = p_id and salon_id = p_salon and removed_at is null;
  insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, pid, 'clock.wifi_removed', '{}'::jsonb);
end $$;

-- Server only (/api/clock/wifi): save the internet address the server saw as the salon's Wi-Fi.
-- The person must be an owner/manager of that salon, or it must come from one of the salon's own devices.
create or replace function public._clock_wifi_add(p_auth_user uuid, p_salon uuid, p_ip text, p_label text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pid uuid; pre text := public._ip_prefix(p_ip); ok boolean;
begin
  select p.id into pid from public.people p where p.auth_user_id = p_auth_user;
  ok := exists (select 1 from public.memberships m where m.salon_id = p_salon and m.person_id = pid and m.archived_at is null and m.role in ('owner', 'manager'));
  if not ok then raise exception 'only the owner or a manager saves the salon Wi-Fi'; end if;
  if pre is null then raise exception 'could not read the internet address'; end if;
  insert into public.salon_wifi (salon_id, prefix, label, added_by) values (p_salon, pre, coalesce(nullif(trim(p_label), ''), 'Salon Wi-Fi'), pid)
    on conflict (salon_id, prefix) do update set removed_at = null, label = excluded.label, added_by = excluded.added_by, added_at = now();
  insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, pid, 'clock.wifi_added', '{}'::jsonb);
  return public.clock_rules_get(p_salon);
exception when others then
  return jsonb_build_object('error', sqlerrm);
end $$;

-- Server only: is this internet address one of the salon's saved Wi-Fi? (for the "You're on the salon Wi-Fi" hint)
create or replace function public._clock_wifi_here(p_salon uuid, p_ip text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.salon_wifi w where w.salon_id = p_salon and w.removed_at is null and w.prefix = public._ip_prefix(p_ip));
$$;

-- The time clock tablet (or front desk) shows this code as a QR. It changes every 30 seconds.
create or replace function public.clock_qr(p_salon uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w bigint := floor(extract(epoch from now()) / 30);
begin
  if not (public._device_of(p_salon, array['front_desk', 'clock', 'kiosk']) or public.is_admin(p_salon)) then
    raise exception 'only a salon device shows the clock-in QR';
  end if;
  insert into public.clock_secrets (salon_id) values (p_salon) on conflict do nothing;
  return jsonb_build_object('salon', p_salon, 'code', public._clock_code(p_salon, w),
    'seconds_left', 30 - (floor(extract(epoch from now()))::bigint % 30));
end $$;

-- Server only (/api/clock/phone): a person clocks in/out on their OWN phone. Checks the salon's rule.
create or replace function public._clock_phone(p_auth_user uuid, p_salon uuid, p_kind text, p_ip text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pid uuid; mid uuid; mode text; w bigint := floor(extract(epoch from now()) / 30);
  qr_ok boolean := false; wifi_ok boolean := false; via text; last text;
begin
  select p.id into pid from public.people p where p.auth_user_id = p_auth_user;
  select m.id into mid from public.memberships m where m.salon_id = p_salon and m.person_id = pid and m.archived_at is null;
  if mid is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if p_kind not in ('in', 'out') then return jsonb_build_object('ok', false, 'reason', 'bad_kind'); end if;
  select coalesce(clock_rules ->> 'phone', 'off') into mode from public.salons where id = p_salon;

  if coalesce(p_code, '') <> '' then
    qr_ok := upper(trim(p_code)) in (public._clock_code(p_salon, w), public._clock_code(p_salon, w - 1));
  end if;
  wifi_ok := public._clock_wifi_here(p_salon, p_ip);

  if mode in ('qr', 'qr_or_wifi') and qr_ok then via := 'qr';
  elsif mode in ('wifi', 'qr_or_wifi') and wifi_ok then via := 'wifi';
  end if;

  if via is null then
    insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, pid, 'clock.refused',
      jsonb_build_object('kind', p_kind, 'rule', mode, 'reason',
        case when mode = 'off' then 'phones_off'
             when coalesce(p_code, '') <> '' and not qr_ok then 'qr_old'
             when mode = 'qr' then 'need_qr'
             when mode = 'wifi' then 'not_salon_wifi'
             else 'need_qr_or_wifi' end));
    return jsonb_build_object('ok', false, 'rule', mode, 'reason',
      case when mode = 'off' then 'phones_off'
           when coalesce(p_code, '') <> '' and not qr_ok then 'qr_old'
           when mode = 'qr' then 'need_qr'
           when mode = 'wifi' then 'not_salon_wifi'
           else 'need_qr_or_wifi' end);
  end if;

  perform 1 from public.memberships where id = mid for update;
  last := public._last_clock(mid);
  if p_kind is distinct from last and not (p_kind = 'out' and last is null) then
    insert into public.clock_events (salon_id, membership_id, kind, source, by_person, via) values (p_salon, mid, p_kind, 'phone', pid, via);
  end if;
  insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, pid, 'clock.phone', jsonb_build_object('kind', p_kind, 'via', via));
  return jsonb_build_object('ok', true, 'kind', p_kind, 'via', via, 'at', now());
end $$;

-- What can THIS person do on their phone right now? (rule only; the Wi-Fi check happens on the server route)
create or replace function public.clock_phone_rule(p_salon uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when public.is_member(p_salon) then coalesce(clock_rules ->> 'phone', 'off') end from public.salons where id = p_salon;
$$;

-- Salon devices (PIN clock on the tablet / front desk) mark their rows too.
create or replace function public._clock_events_via() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.via is null and new.device_id is not null then new.via := 'device'; end if;
  return new;
end $$;
drop trigger if exists clock_events_via on public.clock_events;
create trigger clock_events_via before insert on public.clock_events for each row execute function public._clock_events_via();

-- The old "clock from my phone" with no checks is closed: phones go through the server route now.
revoke execute on function public.clock_self(uuid, text) from public, anon, authenticated;

revoke execute on function public._ip_prefix(text), public._clock_code(uuid, bigint), public._clock_wifi_add(uuid, uuid, text, text),
  public._clock_wifi_here(uuid, text), public._clock_phone(uuid, uuid, text, text, text), public._clock_events_via() from public, anon, authenticated;
grant execute on function public._clock_wifi_add(uuid, uuid, text, text), public._clock_wifi_here(uuid, text),
  public._clock_phone(uuid, uuid, text, text, text) to service_role;
revoke execute on function public.clock_rules_get(uuid), public.clock_rules_save(uuid, text), public.clock_wifi_remove(uuid, uuid),
  public.clock_qr(uuid), public.clock_phone_rule(uuid) from public, anon;
grant execute on function public.clock_rules_get(uuid), public.clock_rules_save(uuid, text), public.clock_wifi_remove(uuid, uuid),
  public.clock_qr(uuid), public.clock_phone_rule(uuid) to authenticated;
