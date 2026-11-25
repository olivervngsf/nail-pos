-- Proof of consent for client texts (Build Tracker 4d; needed before the first real client text).
-- Today a client only has clients.texts_ok (yes/no). The law (TCPA) and the carriers want proof: WHEN a client said
-- yes or STOP, WHERE (booking page, desk, text reply), the WORDS they saw, and WHO recorded it.
--
-- One row per change, never edited or deleted. Written only by the trigger below, so every way texts_ok changes
-- (booking page, desk edit, STOP/START reply, anything later) leaves a row. Callers say where it came from through
-- two settings for the current transaction: nailpos.consent_source + nailpos.consent_words.
-- The texting server sends confirm / reminder / promo texts only when the client's LATEST row says yes.

create table public.text_consents (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  client_id uuid not null references public.clients(id),
  phone text,
  said text not null check (said in ('yes', 'no')),
  source text not null,          -- booking_page:<web|google|…> · desk · text_reply · unknown
  words text,                    -- what the client saw or sent (checkbox text, STOP, START)
  by_person uuid references public.people(id),   -- who recorded it (desk), null for the client themself
  ip text,
  user_agent text,
  at timestamptz not null default now()
);
create index text_consents_client on public.text_consents (client_id, at desc);
create index text_consents_phone on public.text_consents (salon_id, phone, at desc);
alter table public.text_consents enable row level security;
-- No policies: read through client_consent() (desk roles); written only by the trigger.

create or replace function public._consent_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h json; src text; w text;
begin
  if tg_op = 'INSERT' and not new.texts_ok then return new; end if;
  if tg_op = 'UPDATE' and new.texts_ok is not distinct from old.texts_ok then return new; end if;
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  src := coalesce(nullif(current_setting('nailpos.consent_source', true), ''), 'unknown');
  w := left(nullif(current_setting('nailpos.consent_words', true), ''), 500);
  insert into public.text_consents (salon_id, client_id, phone, said, source, words, by_person, ip, user_agent, at)
  values (new.salon_id, new.id, new.phone, case when new.texts_ok then 'yes' else 'no' end, src, w,
    case when src = 'desk' then public.my_person_id() end,
    left(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), 64), left(h->>'user-agent', 300), clock_timestamp());
  return new;
end $$;

create trigger clients_consent_log after insert or update of texts_ok on public.clients
for each row execute function public._consent_log();

-- Booking page: same function as before, plus "where + words" for the consent row.
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
  where v.w >= now() - interval '1 minute';
  insert into public.audit_log (salon_id, action, detail) values (s.id, 'booking.page', jsonb_build_object('ids', ids, 'source', src));
  return jsonb_build_object('ok', true, 'ids', ids, 'start', st, 'day', day, 'staff', names,
    'token', (select manage_token from public.appointments where id = ids[1]),
    'notify', exists (select 1 from public.reminders where appointment_id = ids[1] and kind = 'confirm' and status = 'queued'));
exception when raise_exception then
  if sqlerrm = 'taken' then return jsonb_build_object('ok', false, 'reason', 'taken'); end if;
  raise;
end $$;

-- Desk: same function as before, plus "where + words + who" for the consent row (the desk tells the client).
create or replace function public.client_save(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (p->>'salonId')::uuid; cid uuid := (p->>'id')::uuid; by_m uuid;
begin
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;
  perform set_config('nailpos.consent_source', 'desk', true);
  perform set_config('nailpos.consent_words', coalesce(nullif(left(p->>'consentText', 500), ''), 'Client agreed to get texts'), true);
  if cid is null then
    if coalesce(trim(p->>'name'), '') = '' and coalesce(p->>'phone', '') = '' then raise exception 'name or phone needed'; end if;
    if coalesce(p->>'phone', '') <> '' and exists (select 1 from public.clients where salon_id = sid and phone = p->>'phone') then
      raise exception 'this phone is already a client';
    end if;
    insert into public.clients (salon_id, phone, name) values (sid, nullif(p->>'phone', ''), coalesce(trim(p->>'name'), '')) returning id into cid;
  else
    if not exists (select 1 from public.clients where id = cid and salon_id = sid) then raise exception 'not allowed'; end if;
    -- Editing someone already on file: an owner/manager OK for 'client', used once and credited to whoever gave it.
    update public.discount_approvals set used_at = now()
    where id = (p->>'approvalId')::uuid and salon_id = sid and purpose = 'client' and used_at is null and at > now() - interval '15 minutes'
    returning membership_id into by_m;
    if by_m is null then raise exception 'editing a client needs an owner or manager OK'; end if;
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (sid, public.my_person_id(), 'client.edited', jsonb_build_object('client', cid, 'by', by_m,
      'fields', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(p - 'id' - 'salonId' - 'approvalId' - 'consentText') k)));
  end if;
  update public.clients set
    name = coalesce(nullif(trim(p->>'name'), ''), name), phone = coalesce(nullif(p->>'phone', ''), phone), email = nullif(coalesce(p->>'email', email), ''),
    birthday = case when p ? 'birthday' then nullif(p->>'birthday', '')::date else birthday end,
    shape = coalesce(p->>'shape', shape), colors = coalesce(p->>'colors', colors), care = coalesce(p->>'care', care), notes = coalesce(p->>'notes', notes),
    usual_staff = case when p ? 'usualStaff' then public._salon_member(sid, nullif(p->>'usualStaff', '')::uuid) else usual_staff end,
    texts_ok = coalesce((p->>'textsOk')::boolean, texts_ok), language = coalesce(nullif(p->>'language', ''), language), updated_at = now()
  where id = cid;
  return cid;
end $$;

-- STOP / START by text reply (server only, from /api/sms/inbound): keeps texts_ok in step and records the reply.
create or replace function public.consent_text_reply(p_salon uuid, p_phone text, p_stop boolean, p_words text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform set_config('nailpos.consent_source', 'text_reply', true);
  perform set_config('nailpos.consent_words', left(coalesce(p_words, case when p_stop then 'STOP' else 'START' end), 160), true);
  update public.clients set texts_ok = not p_stop, updated_at = now() where salon_id = p_salon and phone = p_phone;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.consent_text_reply(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.consent_text_reply(uuid, text, boolean, text) to service_role;

-- What the desk sees on a client: the latest answer first, every change after it. Desk roles only (techs never).
create or replace function public.client_consent(p_client uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare sid uuid;
begin
  select salon_id into sid from public.clients where id = p_client;
  if sid is null or not public._is_desk(sid) then raise exception 'not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('said', c.said, 'source', c.source, 'words', c.words, 'at', c.at,
      'by', (select coalesce(nullif(pp.name, ''), 'Staff') from public.people pp where pp.id = c.by_person)) order by c.at desc)
    from public.text_consents c where c.client_id = p_client), '[]'::jsonb);
end $$;
revoke execute on function public.client_consent(uuid) from public, anon;
grant execute on function public.client_consent(uuid) to authenticated;

-- The texting server: may this phone get confirm / reminder / promo texts at this salon? Only when the latest
-- recorded answer is yes (a yes on file from before these records counts as no record: ask again).
create or replace function public.consent_ok(p_salon uuid, p_phone text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.said = 'yes' from public.text_consents c
    where c.salon_id = p_salon and c.phone = p_phone order by c.at desc limit 1), false);
$$;
revoke execute on function public.consent_ok(uuid, text) from public, anon, authenticated;
grant execute on function public.consent_ok(uuid, text) to service_role;
