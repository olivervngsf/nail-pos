-- Booking reminders the owner can set (Settings → Booking reminders) + a test mode + a once-a-minute sender.
-- 1) When: salons.booking_settings.reminders = {first: 0|12|24|48, second: 0|1|2|3} hours before the booking
--    (0 = off; default 24 + 2). One trigger on reminders sets send_at for every place that queues or moves a
--    reminder (book_create, appt_save, book_move…), so the owner's choice always wins. A reminder whose time has
--    already passed when it is queued (booked 3h ahead with a 24h reminder) is skipped, never sent late.
-- 2) Test mode (24h): the 2nd reminder of each NEW booking goes out 3 minutes after booking (to try it live).
-- 3) Sender: pg_cron calls /api/cron/booking-reminders every minute (pg_net) with a token the server keeps in
--    platform_secrets 'db_cron'. The app registers its own URL + token the first time the GitHub "Scheduled texts"
--    job calls it with CRON_SECRET (db_cron_register), so nothing is set up by hand; before that it does nothing.

-- Supabase has both add-ons; a plain Postgres (CI, backup restore test) has neither: then the minute job is just
-- not scheduled and the half-hourly GitHub job keeps sending reminders.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create schema if not exists extensions;
    create extension if not exists pg_net with schema extensions;   -- its functions live in schema net either way
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then create extension if not exists pg_cron; end if;
end $$;

create function public._reminder_prefs(s jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'first', coalesce((s->'reminders'->>'first')::int, 24),
    'second', coalesce((s->'reminders'->>'second')::int, 2),
    'testUntil', case when (s->'reminders'->>'testUntil')::timestamptz > now() then s->'reminders'->>'testUntil' end) $$;

create function public._reminder_timing() returns trigger
language plpgsql security definer set search_path = '' as $$
declare st timestamptz; bs jsonb; p jsonb; h int;
begin
  if new.kind not in ('day_before', 'two_hours') or new.status <> 'queued' then return new; end if;
  select a.start_at, s.booking_settings into st, bs
  from public.appointments a join public.salons s on s.id = a.salon_id where a.id = new.appointment_id;
  if st is null then return new; end if;
  p := public._reminder_prefs(bs);
  h := case new.kind when 'day_before' then (p->>'first')::int else (p->>'second')::int end;
  if h = 0 then new.status := 'skipped'; new.error := 'turned off by the salon'; return new; end if;
  new.send_at := st - make_interval(hours => h);
  if tg_op = 'INSERT' and new.kind = 'two_hours' and p->>'testUntil' is not null then
    new.send_at := now() + interval '3 minutes';
  elsif new.send_at < now() - interval '1 minute' then
    new.status := 'skipped'; new.error := 'booked after this reminder time';
  end if;
  return new;
end $$;

create trigger reminders_timing before insert or update of send_at on public.reminders
  for each row execute function public._reminder_timing();

-- Owner/manager read + save.
create function public.reminder_settings_get(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then raise exception 'Only the owner or a manager can see reminder settings' using errcode = '42501'; end if;
  return (select public._reminder_prefs(booking_settings) || jsonb_build_object('timeZone', time_zone) from public.salons where id = p_salon);
end $$;

create function public.reminder_settings_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f int := coalesce((p->>'first')::int, 24); s int := coalesce((p->>'second')::int, 2);
  t text := case when coalesce((p->>'test')::boolean, false) then (now() + interval '24 hours')::text end;
begin
  if not public.is_admin(p_salon) then raise exception 'Only the owner or a manager can change reminders' using errcode = '42501'; end if;
  if f not in (0, 12, 24, 48) or s not in (0, 1, 2, 3) then raise exception 'Pick one of the listed times' using errcode = '22023'; end if;
  update public.salons set booking_settings = coalesce(booking_settings, '{}'::jsonb)
    || jsonb_build_object('reminders', jsonb_build_object('first', f, 'second', s, 'testUntil', t))
  where id = p_salon;
  insert into public.audit_log (salon_id, action, detail)
  values (p_salon, 'reminders.saved', jsonb_build_object('first', f, 'second', s, 'test', t is not null));
  return public.reminder_settings_get(p_salon);
end $$;

-- Once-a-minute sender (server-made URL + token; nothing until the app registers itself).
create function public.db_cron_register(p_url text) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  if p_url !~ '^https://[a-z0-9.-]+$' then raise exception 'bad url' using errcode = '22023'; end if;
  insert into public.platform_secrets (name, value)
  values ('db_cron', jsonb_build_object('url', p_url, 'token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
  on conflict (name) do update set value = public.platform_secrets.value || jsonb_build_object('url', p_url), updated_at = now();
  select value->>'token' into tok from public.platform_secrets where name = 'db_cron';
  return tok;
end $$;

create function public._cron_ping() returns void
language plpgsql security definer set search_path = '' as $$
declare u text; t text;
begin
  select value->>'url', value->>'token' into u, t from public.platform_secrets where name = 'db_cron';
  if u is null or t is null then return; end if;
  perform net.http_post(url := u || '/api/cron/booking-reminders', body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || t, 'Content-Type', 'application/json'), timeout_milliseconds := 30000);
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('polishos-booking-reminders', '* * * * *', 'select public._cron_ping()');
  end if;
end $$;

revoke execute on function public._reminder_prefs(jsonb), public._reminder_timing(), public._cron_ping() from public, anon, authenticated;
revoke execute on function public.db_cron_register(text) from public, anon, authenticated;
grant execute on function public.db_cron_register(text) to service_role;
revoke execute on function public.reminder_settings_get(uuid), public.reminder_settings_save(uuid, jsonb) from public, anon;
grant execute on function public.reminder_settings_get(uuid), public.reminder_settings_save(uuid, jsonb) to authenticated;
