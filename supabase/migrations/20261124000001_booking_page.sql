-- Session 7 (M8): public booking page (polishosapp.com/<salon>), walk-in kiosk, staff phone booking, owner page settings.
-- Booking page = no account, no app. The server re-checks every time and holds a per-salon lock while booking,
-- so the page can never double-book. Every booking keeps where it came from.

-- ---------- settings ----------
alter table public.salons add column slug text unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  add column booking_settings jsonb not null default '{"on": true, "days_ahead": 30, "latest_before_close": 60, "group_max": 6, "cancel_hours": 2, "min_notice": 30}';
alter table public.services add column online boolean not null default true;

-- Slug from the name (lotus-nails, lotus-nails-2, …). Follows the salon name until the owner picks one (booking_settings.slug_set).
create function public._slug_reserved() returns text[] language sql immutable set search_path = '' as $$
  select array['book', 'kiosk', 'setup', 'login', 'today', 'checkout', 'clients', 'calendar', 'settings', 'pay', 'join', 'api', 'admin', 'gift-cards', 'kit', 'paid', 't', 'r', 'me', 'close-day', 'salon', 'demo'];
$$;
create function public._slug_for(p_name text, p_id uuid) returns text language plpgsql stable security definer set search_path = '' as $$
declare base text := left(trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')), 34); s text; n int := 1;
begin
  base := trim(both '-' from base);
  if length(base) < 3 then base := 'salon'; end if;
  s := base;
  while exists (select 1 from public.salons where slug = s and id <> p_id) or s = any (public._slug_reserved()) loop
    n := n + 1; s := base || '-' || n;
  end loop;
  return s;
end $$;
create function public._salon_slug() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.slug is null or (tg_op = 'UPDATE' and new.name is distinct from old.name and not coalesce((new.booking_settings->>'slug_set')::boolean, false)) then
    new.slug := public._slug_for(new.name, new.id);
  end if;
  return new;
end $$;
create trigger salon_slug before insert or update of name on public.salons for each row execute function public._salon_slug();
do $$ declare r record; begin   -- one by one, so two salons with the same name get lotus + lotus-2
  for r in select id, name from public.salons where slug is null order by created_at loop
    update public.salons set slug = public._slug_for(r.name, r.id) where id = r.id;
  end loop;
end $$;
revoke execute on function public._slug_for(text, uuid), public._salon_slug() from public, anon, authenticated;

-- New bookings can come from more places.
alter table public.appointments drop constraint appointments_source_check;
alter table public.appointments add constraint appointments_source_check
  check (source in ('desk', 'phone', 'walk_in', 'web', 'google', 'text', 'staff', 'website', 'instagram', 'qr', 'kiosk', 'staff_phone'));
alter table public.appointments add column party_id uuid;            -- a group booked together

create table public.salon_photos (
  id uuid primary key,
  salon_id uuid not null references public.salons(id),
  path text not null,                                               -- Storage bucket salon-photos: <salon>/<id>.jpg (public)
  label text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
alter table public.salon_photos enable row level security;
create policy "members read" on public.salon_photos for select to authenticated using (public.is_member(salon_id));

-- ---------- free start times ----------
-- Start times (minutes after midnight, salon time) on p_day where the staff (or, if null, any tech) is free for p_minutes.
-- Honors open hours, days ahead, minimum notice, latest same-day start, and every live booking.
create function public._free_starts(p_salon uuid, p_day date, p_staff uuid, p_minutes int, p_public boolean)
returns table (start_min int, staff_ids uuid[])
language plpgsql stable security definer set search_path = '' as $$
declare s public.salons; h public.salon_hours; tz text; open_m int; close_m int; now_local timestamp; last_m int; m int; ids uuid[];
begin
  select * into s from public.salons where id = p_salon;
  tz := s.time_zone;
  now_local := now() at time zone tz;
  select * into h from public.salon_hours where salon_id = p_salon and weekday = extract(isodow from p_day)::int - 1;
  if h.salon_id is null or not h.is_open or p_minutes is null or p_minutes < 5 then return; end if;
  if p_public and (p_day < now_local::date or p_day > now_local::date + coalesce((s.booking_settings->>'days_ahead')::int, 30)) then return; end if;
  open_m := extract(hour from h.opens) * 60 + extract(minute from h.opens);
  close_m := extract(hour from h.closes) * 60 + extract(minute from h.closes);
  last_m := close_m - p_minutes;
  if p_public and p_day = now_local::date then
    last_m := least(last_m, close_m - coalesce((s.booking_settings->>'latest_before_close')::int, 60));
  end if;
  m := open_m;
  while m <= last_m loop
    if p_day > now_local::date or m >= extract(hour from now_local) * 60 + extract(minute from now_local) + (case when p_public then coalesce((s.booking_settings->>'min_notice')::int, 30) else 0 end) then
      select array_agg(mm.id order by mm.display_name) into ids from public.memberships mm
      where mm.salon_id = p_salon and mm.archived_at is null and mm.role = 'tech' and (p_staff is null or mm.id = p_staff)
        and not exists (select 1 from public.appointments a where a.staff_id = mm.id and a.status not in ('canceled', 'no_show')
          and a.start_at < ((p_day + make_interval(mins => m + p_minutes))::timestamp at time zone tz)
          and a.end_at > ((p_day + make_interval(mins => m))::timestamp at time zone tz));
      if ids is not null then start_min := m; staff_ids := ids; return next; end if;
    end if;
    m := m + 15;
  end loop;
end $$;

-- ---------- public booking page (no sign-in) ----------
create function public._salon_by_slug(p_slug text) returns public.salons language sql stable security definer set search_path = '' as $$
  select * from public.salons where slug = lower(p_slug) and archived_at is null and coalesce((booking_settings->>'on')::boolean, true);
$$;

create function public.book_page(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.salons;
begin
  s := public._salon_by_slug(p_slug);
  if s.id is null then return null; end if;
  return jsonb_build_object(
    'salon', jsonb_build_object('name', s.name, 'phone', s.phone, 'address', s.address, 'slug', s.slug, 'timeZone', s.time_zone, 'settings', s.booking_settings),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', weekday, 'open', is_open, 'opens', to_char(opens, 'HH24:MI'), 'closes', to_char(closes, 'HH24:MI')) order by weekday)
      from public.salon_hours where salon_id = s.id), '[]'),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'label', label) order by sort, created_at) from public.salon_photos where salon_id = s.id and removed_at is null), '[]'),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'cat', category, 'name', name, 'minutes', minutes, 'cents', price_cents, 'from', price_from) order by sort, name)
      from public.services where salon_id = s.id and archived_at is null and online), '[]'),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', display_name) order by display_name)
      from public.memberships where salon_id = s.id and archived_at is null and role = 'tech'), '[]'));
end $$;

create function public.book_slots(p_slug text, p_day date, p_staff uuid, p_minutes int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.salons;
begin
  s := public._salon_by_slug(p_slug);
  if s.id is null then return '[]'; end if;
  return coalesce((select jsonb_agg(start_min order by start_min) from public._free_starts(s.id, p_day, p_staff, p_minutes, true)), '[]');
end $$;

-- Returning client: first name only (nothing private: no visits, no services, no last name).
create function public.book_hello(p_slug text, p_phone text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('first', split_part(c.name, ' ', 1))
  from public.clients c join public.salons s on s.id = c.salon_id
  where s.slug = lower(p_slug) and c.phone = p_phone and c.archived_at is null and c.name <> '';
$$;

-- Book from the page. p: { slug, src, day (YYYY-MM-DD), start (minutes), phone, name, textsOk, note,
--   guests: [{ name, serviceIds: [...], staffId? }] }  (first guest = the person booking)
-- Returns { ok, ids, start, staff: [names] } or { ok: false, reason: taken | closed | too_many | bad }.
create function public.book_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.salons; cid uuid; g jsonb; svc jsonb; mins int; cents bigint; sid uuid; free uuid[]; used uuid[] := '{}'; ids uuid[] := '{}'; names text[] := '{}';
  day date := (p->>'day')::date; st int := (p->>'start')::int; party uuid := gen_random_uuid(); aid uuid; src text; tz text; nm text;
begin
  s := public._salon_by_slug(p->>'slug');
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if coalesce(p->>'phone', '') !~ '^\+1[0-9]{10}$' or coalesce(trim(p->>'name'), '') = '' then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if jsonb_array_length(coalesce(p->'guests', '[]')) not between 1 and coalesce((s.booking_settings->>'group_max')::int, 6) then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  tz := s.time_zone;
  src := case when p->>'src' in ('google', 'website', 'instagram', 'qr', 'text') then p->>'src' else 'web' end;
  -- One booking at a time per salon: the second click / second person waits, then sees the time taken.
  perform pg_advisory_xact_lock(hashtext('book:' || s.id::text));
  if (select count(*) from public.appointments a join public.clients c on c.id = a.client_id
      where a.salon_id = s.id and c.phone = p->>'phone' and a.start_at > now() and a.status in ('booked', 'confirmed')
        and a.source in ('web', 'google', 'website', 'instagram', 'qr', 'text')) >= 6 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into public.clients (salon_id, phone, name, texts_ok) values (s.id, p->>'phone', trim(p->>'name'), coalesce((p->>'textsOk')::boolean, false))
  on conflict (salon_id, phone) do update set name = coalesce(nullif(public.clients.name, ''), excluded.name),
    texts_ok = public.clients.texts_ok or excluded.texts_ok
  returning id into cid;

  for g in select * from jsonb_array_elements(p->'guests') loop
    select coalesce(sum(minutes), 0), coalesce(sum(price_cents), 0),
           coalesce(jsonb_agg(jsonb_build_object('serviceId', id, 'name', name, 'minutes', minutes, 'cents', price_cents)), '[]')
      into mins, cents, svc
      from public.services where salon_id = s.id and archived_at is null and online
        and id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(g->'serviceIds', '[]')) x);
    if mins = 0 then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
    select f.staff_ids into free from public._free_starts(s.id, day, nullif(g->>'staffId', '')::uuid, mins, true) f where f.start_min = st;
    select x into sid from unnest(free) x where not (x = any (used)) limit 1;
    if sid is null then
      if array_length(ids, 1) > 0 then raise exception 'taken'; end if;   -- undo earlier guests of this group
      return jsonb_build_object('ok', false, 'reason', 'taken');
    end if;
    used := used || sid;
    nm := case when array_length(ids, 1) is null then trim(p->>'name') else coalesce(nullif(trim(g->>'name'), ''), trim(p->>'name') || ' (guest)') end;
    aid := gen_random_uuid();
    insert into public.appointments (id, salon_id, client_id, client_name, staff_id, start_at, end_at, services, status, source, note, party_id)
    values (aid, s.id, cid, nm, sid, (day + make_interval(mins => st))::timestamp at time zone tz, (day + make_interval(mins => st + mins))::timestamp at time zone tz,
            svc, 'booked', src, left(coalesce(p->>'note', ''), 500), case when jsonb_array_length(p->'guests') > 1 then party end);
    ids := ids || aid;
    names := names || (select display_name from public.memberships where id = sid);
  end loop;
  -- Confirmation + reminders (only when the client said yes to texts).
  if coalesce((select texts_ok from public.clients where id = cid), false) then
    insert into public.reminders (salon_id, appointment_id, kind, send_at)
    select s.id, a.id, k, w from public.appointments a, lateral (values ('confirm', now()), ('day_before', a.start_at - interval '1 day'), ('two_hours', a.start_at - interval '2 hours')) v(k, w)
    where a.id = ids[1] and w >= now() - interval '1 minute';
  end if;
  insert into public.audit_log (salon_id, action, detail) values (s.id, 'booking.page', jsonb_build_object('ids', ids, 'source', src));
  return jsonb_build_object('ok', true, 'ids', ids, 'start', st, 'day', day, 'staff', names);
exception when raise_exception then
  if sqlerrm = 'taken' then return jsonb_build_object('ok', false, 'reason', 'taken'); end if;
  raise;
end $$;

-- ---------- walk-in kiosk (salon iPad, signed in as the salon) ----------
-- Check-in itself is saved like any booking (appt_save, source kiosk) so it works offline.
-- Returning client at the kiosk: first name + last services (salon device only).
create function public.kiosk_hello(p_salon uuid, p_phone text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public._is_desk(p_salon) then (
    select jsonb_build_object('first', split_part(c.name, ' ', 1),
      'last', (select jsonb_agg(jsonb_build_object('id', l.service_id, 'name', l.name, 'staffId', l.staff_id) order by l.sort)
               from public.ticket_lines l where l.ticket_id = (select t.id from public.tickets t where t.client_id = c.id and t.status = 'paid' order by t.paid_at desc limit 1)
                 and l.kind = 'service' and l.removed_at is null))
    from public.clients c where c.salon_id = p_salon and c.phone = p_phone and c.archived_at is null) end;
$$;

-- ---------- staff phone: book my own clients into my own free times ----------
create function public.my_slots(p_salon uuid, p_day date, p_minutes int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public._me_in(p_salon);
begin
  if me is null then raise exception 'not allowed'; end if;
  return coalesce((select jsonb_agg(start_min order by start_min) from public._free_starts(p_salon, p_day, me, p_minutes, false)), '[]');
end $$;

create function public.my_regulars(p_salon uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(r order by (r->>'visits')::int desc), '[]') from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'visits', count(distinct t.id), 'last', max(t.paid_at),
      'service', (array_agg(l.name order by t.paid_at desc))[1], 'serviceId', (array_agg(l.service_id order by t.paid_at desc))[1]) r
    from public.ticket_lines l join public.tickets t on t.id = l.ticket_id join public.clients c on c.id = t.client_id
    where l.salon_id = p_salon and l.staff_id = public._me_in(p_salon) and l.kind = 'service' and l.removed_at is null and t.status = 'paid'
    group by c.id, c.name, c.phone order by count(distinct t.id) desc limit 12) z;
$$;

-- p: { id, salonId, phone, name, serviceIds: [], day, start (minutes) }. Only into my own free time.
create function public.staff_book(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (p->>'salonId')::uuid; me uuid := public._me_in(sid); s public.salons; cid uuid; mins int; svc jsonb;
  day date := (p->>'day')::date; st int := (p->>'start')::int;
begin
  if me is null then raise exception 'not allowed'; end if;
  if exists (select 1 from public.appointments where id = (p->>'id')::uuid) then return jsonb_build_object('ok', true, 'repeat', true); end if;
  select * into s from public.salons where id = sid;
  perform pg_advisory_xact_lock(hashtext('book:' || sid::text));
  select coalesce(sum(minutes), 0)::int, coalesce(jsonb_agg(jsonb_build_object('serviceId', id, 'name', name, 'minutes', minutes, 'cents', price_cents)), '[]')
    into mins, svc from public.services where salon_id = sid and archived_at is null
      and id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p->'serviceIds', '[]')) x);
  if mins = 0 then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if not exists (select 1 from public._free_starts(sid, day, me, mins, false) f where f.start_min = st) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  if coalesce(p->>'phone', '') ~ '^\+1[0-9]{10}$' then
    insert into public.clients (salon_id, phone, name) values (sid, p->>'phone', coalesce(trim(p->>'name'), ''))
    on conflict (salon_id, phone) do update set name = coalesce(nullif(public.clients.name, ''), excluded.name) returning id into cid;
  end if;
  insert into public.appointments (id, salon_id, client_id, client_name, staff_id, start_at, end_at, services, status, source, created_by)
  values ((p->>'id')::uuid, sid, cid, coalesce(trim(p->>'name'), ''), me, (day + make_interval(mins => st))::timestamp at time zone s.time_zone,
          (day + make_interval(mins => st + mins))::timestamp at time zone s.time_zone, svc, 'booked', 'staff_phone', me);
  return jsonb_build_object('ok', true);
end $$;

-- Undo right after booking (my own staff-phone booking only).
create function public.staff_unbook(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_id;
  if a.id is null or a.source <> 'staff_phone' or a.created_by is distinct from public._me_in(a.salon_id) or a.status not in ('booked', 'confirmed') then
    raise exception 'not allowed';
  end if;
  update public.appointments set status = 'canceled', updated_at = now() where id = p_id;
  delete from public.reminders where appointment_id = p_id and status = 'queued';
end $$;

-- Owner page: link, rules, photos, which services show online.
create function public.booking_settings_get(p_salon uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.is_admin(p_salon) then jsonb_build_object('slug', s.slug, 'settings', s.booking_settings,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'path', path, 'label', label) order by sort, created_at) from public.salon_photos where salon_id = s.id and removed_at is null), '[]'),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'cat', category, 'name', name, 'online', online) order by sort, name) from public.services where salon_id = s.id and archived_at is null), '[]'))
  end from public.salons s where s.id = p_salon;
$$;

-- ---------- owner: booking page settings + photos ----------
-- p: { slug?, on?, days_ahead?, latest_before_close?, group_max?, cancel_hours? }
create function public.booking_settings_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cur jsonb; sl text := nullif(lower(trim(p->>'slug')), '');
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if sl is not null and sl !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then return jsonb_build_object('ok', false, 'reason', 'slug_bad'); end if;
  if sl is not null and exists (select 1 from public.salons where slug = sl and id <> p_salon) then return jsonb_build_object('ok', false, 'reason', 'slug_taken'); end if;
  if sl = any (public._slug_reserved()) then
    return jsonb_build_object('ok', false, 'reason', 'slug_taken');
  end if;
  select booking_settings into cur from public.salons where id = p_salon;
  update public.salons set slug = coalesce(sl, slug), booking_settings = cur || jsonb_strip_nulls(jsonb_build_object(
    'slug_set', case when sl is not null then true end,
    'on', (p->>'on')::boolean,
    'days_ahead', least(90, greatest(1, (p->>'days_ahead')::int)),
    'latest_before_close', least(240, greatest(0, (p->>'latest_before_close')::int)),
    'group_max', least(6, greatest(1, (p->>'group_max')::int)),
    'cancel_hours', least(48, greatest(0, (p->>'cancel_hours')::int)))) where id = p_salon;
  return jsonb_build_object('ok', true, 'slug', (select slug from public.salons where id = p_salon));
end $$;

create function public.service_online(p_service uuid, p_online boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (select salon_id from public.services where id = p_service);
begin
  if sid is null or not public.is_admin(sid) then raise exception 'not allowed'; end if;
  update public.services set online = p_online where id = p_service;
end $$;

create function public.salon_photo_add(p_id uuid, p_salon uuid, p_path text, p_label text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if p_path not like p_salon::text || '/%' then raise exception 'bad photo path'; end if;
  insert into public.salon_photos (id, salon_id, path, label, sort)
  values (p_id, p_salon, p_path, coalesce(p_label, ''), coalesce((select max(sort) + 1 from public.salon_photos where salon_id = p_salon), 0))
  on conflict (id) do nothing;
end $$;

create function public.salon_photo_remove(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (select salon_id from public.salon_photos where id = p_id);
begin
  if sid is null or not public.is_admin(sid) then raise exception 'not allowed'; end if;
  update public.salon_photos set removed_at = now() where id = p_id;
end $$;

-- First photo = cover: move one to the front.
create function public.salon_photo_cover(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (select salon_id from public.salon_photos where id = p_id);
begin
  if sid is null or not public.is_admin(sid) then raise exception 'not allowed'; end if;
  update public.salon_photos set sort = (select min(sort) - 1 from public.salon_photos where salon_id = sid) where id = p_id;
end $$;

-- ---------- grants ----------
revoke execute on function public._free_starts(uuid, date, uuid, int, boolean), public._salon_by_slug(text) from public, anon, authenticated;
revoke execute on function public.book_page(text), public.book_slots(text, date, uuid, int), public.book_hello(text, text), public.book_create(jsonb),
  public.kiosk_hello(uuid, text), public.my_slots(uuid, date, int), public.my_regulars(uuid),
  public.staff_book(jsonb), public.staff_unbook(uuid), public.booking_settings_get(uuid), public.booking_settings_save(uuid, jsonb), public.service_online(uuid, boolean),
  public.salon_photo_add(uuid, uuid, text, text), public.salon_photo_remove(uuid), public.salon_photo_cover(uuid) from public;
-- The booking page is public (no sign-in).
grant execute on function public.book_page(text), public.book_slots(text, date, uuid, int), public.book_hello(text, text), public.book_create(jsonb) to anon, authenticated;
grant execute on function public.kiosk_hello(uuid, text), public.my_slots(uuid, date, int), public.my_regulars(uuid),
  public.staff_book(jsonb), public.staff_unbook(uuid), public.booking_settings_get(uuid), public.booking_settings_save(uuid, jsonb), public.service_online(uuid, boolean),
  public.salon_photo_add(uuid, uuid, text, text), public.salon_photo_remove(uuid), public.salon_photo_cover(uuid) to authenticated;

-- ---------- salon photo files (public read; only owner/manager uploads) ----------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('salon-photos', 'salon-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    execute $p$create policy "salon admins upload salon photos" on storage.objects for insert to authenticated
      with check (bucket_id = 'salon-photos' and public.is_admin(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;
