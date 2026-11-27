-- Bug (Nov 26, Oliver's 2nd live test): a booking less than 2 hours away got NO 2-hour reminder row at all, because
-- book_create only made reminders whose fixed time (start - 1 day / - 2 hours) was still ahead. So the owner's own
-- times and the 3-minute test reminder (worked out by trigger _reminder_timing) never got a chance.
-- Now: for a future booking both reminder rows are always made; the trigger sets the real time from the owner's
-- settings, or marks one skipped with a plain reason (off, time already passed) that shows in Messages.
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
  perform set_config('nailpos.consent_source', 'booking_page:' || src, true);
  perform set_config('nailpos.consent_words', coalesce(nullif(left(p->>'consentText', 500), ''), 'Text me a confirmation + reminder. Reply STOP anytime.'), true);
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
  where v.k = 'confirm' or start_ts > now();  -- reminder times: trigger _reminder_timing (owner settings, test mode, skip if passed)
  insert into public.audit_log (salon_id, action, detail) values (s.id, 'booking.page', jsonb_build_object('ids', ids, 'source', src));
  return jsonb_build_object('ok', true, 'ids', ids, 'start', st, 'day', day, 'staff', names,
    'token', (select manage_token from public.appointments where id = ids[1]),
    'notify', exists (select 1 from public.reminders where appointment_id = ids[1] and kind = 'confirm' and status = 'queued'));
exception when raise_exception then
  if sqlerrm = 'taken' then return jsonb_build_object('ok', false, 'reason', 'taken'); end if;
  raise;
end $$;
