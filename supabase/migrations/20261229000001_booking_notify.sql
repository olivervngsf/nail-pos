-- Booking confirmations that really go out: by email, by text, or both.
-- The client gives a cell phone, an email, or both (one is required). Each message to send is one row in `reminders`
-- with its channel and where it goes (the contact typed for THIS booking, not whatever is on file).
-- The server route /api/book/notify (secret key) claims the queued 'confirm' rows, sends them (email: Resend,
-- text: Twilio, only when the salon's texting is approved) and records sent / skipped / failed.
-- Day-before and 2-hour rows are queued the same way for the scheduled sender (next step).

alter table public.reminders
  add column channel text not null default 'sms' check (channel in ('sms', 'email')),
  add column to_addr text,                    -- phone (+1…) or email this message goes to
  add column sent_at timestamptz,
  add column error text;
alter table public.reminders drop constraint reminders_status_check;
alter table public.reminders add constraint reminders_status_check check (status in ('queued', 'sending', 'sent', 'skipped', 'failed'));

-- Book from the page. p: { slug, src, day, start, phone?, email?, name, textsOk, note, guests: [...] }
-- phone or email is required (both fine). Returns { ok, ids, start, day, staff, token, notify } or { ok: false, reason }.
drop function public._book_create_v1(jsonb);
create or replace function public.book_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.salons; cid uuid; g jsonb; svc jsonb; mins int; cents bigint; sid uuid; free uuid[]; used uuid[] := '{}'; ids uuid[] := '{}'; names text[] := '{}';
  day date := (p->>'day')::date; st int := (p->>'start')::int; party uuid := gen_random_uuid(); aid uuid; src text; tz text; nm text;
  ph text := nullif(trim(coalesce(p->>'phone', '')), ''); em text := nullif(lower(trim(coalesce(p->>'email', ''))), '');
  texts boolean; start_ts timestamptz;
begin
  s := public._salon_by_slug(p->>'slug');
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if ph is null and em is null then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if ph is not null and ph !~ '^\+1[0-9]{10}$' then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if em is not null and (em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(em) > 254) then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if coalesce(trim(p->>'name'), '') = '' then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if jsonb_array_length(coalesce(p->'guests', '[]')) not between 1 and coalesce((s.booking_settings->>'group_max')::int, 6) then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  tz := s.time_zone;
  src := case when p->>'src' in ('google', 'website', 'instagram', 'qr', 'text') then p->>'src' else 'web' end;
  texts := ph is not null and coalesce((p->>'textsOk')::boolean, false);
  -- One booking at a time per salon: the second click / second person waits, then sees the time taken.
  perform pg_advisory_xact_lock(hashtext('book:' || s.id::text));
  if (select count(*) from public.appointments a join public.clients c on c.id = a.client_id
      where a.salon_id = s.id and ((ph is not null and c.phone = ph) or (em is not null and lower(c.email) = em))
        and a.start_at > now() and a.status in ('booked', 'confirmed')
        and a.source in ('web', 'google', 'website', 'instagram', 'qr', 'text')) >= 6 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  -- Client on file: by phone when given, else by email. A booking never renames a client or replaces their email
  -- (only fills an empty one).
  if ph is not null then
    insert into public.clients (salon_id, phone, name, email, texts_ok) values (s.id, ph, trim(p->>'name'), em, texts)
    on conflict (salon_id, phone) do update set name = coalesce(nullif(public.clients.name, ''), excluded.name),
      email = coalesce(nullif(public.clients.email, ''), excluded.email),
      texts_ok = public.clients.texts_ok or excluded.texts_ok
    returning id into cid;
  else
    select id into cid from public.clients where salon_id = s.id and lower(email) = em and archived_at is null order by created_at limit 1;
    if cid is null then
      insert into public.clients (salon_id, name, email) values (s.id, trim(p->>'name'), em) returning id into cid;
    end if;
  end if;

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

  -- Messages for this booking (first guest's row carries them): confirmation now, then 1 day and 2 hours before.
  -- Email: whenever an email was given. Text: only when a phone was given and the client said yes to texts.
  start_ts := (select start_at from public.appointments where id = ids[1]);
  insert into public.reminders (salon_id, appointment_id, kind, send_at, channel, to_addr)
  select s.id, ids[1], v.k, v.w, c.channel, c.addr
  from (values ('confirm', now()), ('day_before', start_ts - interval '1 day'), ('two_hours', start_ts - interval '2 hours')) v(k, w),
       (select 'email' as channel, em as addr where em is not null
        union all select 'sms', ph where texts) c
  where v.w >= now() - interval '1 minute';
  insert into public.audit_log (salon_id, action, detail) values (s.id, 'booking.page', jsonb_build_object('ids', ids, 'source', src));
  return jsonb_build_object('ok', true, 'ids', ids, 'start', st, 'day', day, 'staff', names,
    'token', (select manage_token from public.appointments where id = ids[1]),
    'notify', exists (select 1 from public.reminders where appointment_id = ids[1] and kind = 'confirm' and status = 'queued'));
exception when raise_exception then
  if sqlerrm = 'taken' then return jsonb_build_object('ok', false, 'reason', 'taken'); end if;
  raise;
end $$;

-- A client moves their booking: the reminders still waiting move with it (same channel, same address).
create or replace function public.book_move(p_token text, p_day date, p_start int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare first public.appointments; a public.appointments; s public.salons; skip uuid[]; mins int; old timestamptz; new_start timestamptz;
begin
  select * into first from public._manage_party(p_token) where status in ('booked', 'confirmed') limit 1;
  if first.id is null then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  select * into s from public.salons where id = first.salon_id;
  perform pg_advisory_xact_lock(hashtext('book:' || s.id::text));
  if first.start_at - make_interval(hours => coalesce((s.booking_settings->>'cancel_hours')::int, 2)) <= now() then
    return jsonb_build_object('ok', false, 'reason', 'too_late');
  end if;
  select array_agg(id) into skip from public._manage_party(p_token) where status in ('booked', 'confirmed');
  for a in select * from public._manage_party(p_token) where status in ('booked', 'confirmed') loop
    mins := (extract(epoch from a.end_at - a.start_at) / 60)::int;
    if not exists (select 1 from public._free_starts_skip(s.id, p_day, a.staff_id, mins, true, skip) f where f.start_min = p_start) then
      return jsonb_build_object('ok', false, 'reason', 'taken');
    end if;
  end loop;
  old := first.start_at;
  new_start := (p_day + make_interval(mins => p_start))::timestamp at time zone s.time_zone;
  update public.appointments set start_at = new_start,
    end_at = (p_day + make_interval(mins => p_start + (extract(epoch from end_at - start_at) / 60)::int))::timestamp at time zone s.time_zone,
    status = 'booked', updated_at = now()
  where id = any (skip);
  update public.reminders set send_at = new_start - case kind when 'day_before' then interval '1 day' else interval '2 hours' end
  where appointment_id = any (skip) and status = 'queued' and kind in ('day_before', 'two_hours');
  delete from public.reminders where appointment_id = any (skip) and status = 'queued' and kind in ('day_before', 'two_hours') and send_at < now() - interval '1 minute';
  insert into public.audit_log (salon_id, action, detail) values (s.id, 'booking.client_move', jsonb_build_object('ids', skip, 'from', old, 'day', p_day, 'start', p_start));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- server only: send the confirmation ----------
-- Claims the queued 'confirm' messages of the booking behind a link (so two calls never send twice) and returns
-- what the message needs. Called by /api/book/notify with the secret key.
create function public.booking_notice_claim(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare first public.appointments; s public.salons; tz text; sends jsonb;
begin
  select * into first from public._manage_party(p_token) limit 1;
  if first.id is null then return null; end if;
  select * into s from public.salons where id = first.salon_id;
  tz := s.time_zone;
  with c as (
    update public.reminders r set status = 'sending'
    where r.appointment_id in (select id from public._manage_party(p_token)) and r.kind = 'confirm' and r.status = 'queued'
    returning r.id, r.channel, r.to_addr)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'channel', channel, 'to', to_addr)), '[]') into sends from c;
  return jsonb_build_object(
    'sends', sends,
    'salon', jsonb_build_object('name', s.name, 'phone', s.phone, 'address', s.address, 'slug', s.slug,
      'cancelHours', coalesce((s.booking_settings->>'cancel_hours')::int, 2),
      'texting', coalesce((select texting from public.admin_salon_status where salon_id = s.id), 'not_started')),
    'name', split_part(first.client_name, ' ', 1),
    'day', to_char((first.start_at at time zone tz)::date, 'YYYY-MM-DD'),
    'start', (extract(hour from first.start_at at time zone tz) * 60 + extract(minute from first.start_at at time zone tz))::int,
    'guests', (select jsonb_agg(jsonb_build_object('name', split_part(a.client_name, ' ', 1),
        'staff', (select display_name from public.memberships where id = a.staff_id),
        'minutes', (extract(epoch from a.end_at - a.start_at) / 60)::int, 'services', a.services) order by a.start_at, a.created_at)
      from public._manage_party(p_token) a where a.status in ('booked', 'confirmed')));
end $$;

-- Record how one message went: sent, skipped (channel not switched on) or failed.
create function public.booking_notice_done(p_id bigint, p_status text, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('sent', 'skipped', 'failed') then raise exception 'bad status'; end if;
  update public.reminders set status = p_status, error = left(p_error, 300), sent_at = case when p_status = 'sent' then now() end
  where id = p_id and status = 'sending';
end $$;

revoke execute on function public.booking_notice_claim(text), public.booking_notice_done(bigint, text, text) from public, anon, authenticated;
grant execute on function public.booking_notice_claim(text), public.booking_notice_done(bigint, text, text) to service_role;
revoke execute on function public.book_create(jsonb), public.book_move(text, date, int) from public;
grant execute on function public.book_create(jsonb), public.book_move(text, date, int) to anon, authenticated;
