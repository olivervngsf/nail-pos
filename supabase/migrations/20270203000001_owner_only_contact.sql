-- Only the OWNER sees a client's full phone number and email (Oliver, Nov 26).
-- Managers, front desk and techs get them hidden from the server too, not only on screen:
--   phone ••7011, email l•••@gmail.com.
-- The app keeps working with the hidden value:
--   * saves that send a hidden phone/email back (ticket, booking, tech booking, client edit, receipt)
--     use the client already on file (by id) and never overwrite or store the hidden text;
--   * gift card + loyalty lookups also take the client id;
--   * Call / Text gets the number from client_contact_log, only for roles the owner switched on, logged.
-- Direct reads of clients.phone / clients.email from the browser are closed (column privileges).
-- Known limit: a salon device signed in with the OWNER's own login is the owner to the server,
-- so it still receives full numbers (the screen hides them by the PIN'd person). Use a QR device login.

-- 1. Who sees it, and the hidden forms ------------------------------------------------------------
create or replace function public._sees_contact(p_salon uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner(p_salon);
$$;

create or replace function public._is_masked(v text) returns boolean
language sql immutable set search_path = '' as $$
  select position('•' in coalesce(v, '')) > 0;
$$;

create or replace function public._viewer_phone(p_salon uuid, p_phone text) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_phone is null or p_phone = '' then coalesce(p_phone, '')
              when public._sees_contact(p_salon) then p_phone
              else '••' || right(regexp_replace(p_phone, '\D', '', 'g'), 4) end;
$$;

create or replace function public._viewer_email(p_salon uuid, p_email text) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_email is null or p_email = '' then coalesce(p_email, '')
              when public._sees_contact(p_salon) then p_email
              else left(p_email, 1) || '•••@' || split_part(p_email, '@', 2) end;
$$;

-- A client object sent back by the app with hidden phone/email: put the real ones back from the
-- client on file (same salon only). Server use only.
create or replace function public._unmask_client(p_salon uuid, c jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cl public.clients;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return c; end if;
  if not (public._is_masked(c->>'phone') or public._is_masked(c->>'email')) then return c; end if;
  if coalesce(c->>'id', '') ~ '^[0-9a-f-]{36}$' then
    select * into cl from public.clients where id = (c->>'id')::uuid and salon_id = p_salon;
  end if;
  if public._is_masked(c->>'phone') then c := c || jsonb_build_object('phone', coalesce(cl.phone, '')); end if;
  if public._is_masked(c->>'email') then c := c || jsonb_build_object('email', coalesce(cl.email, '')); end if;
  return c;
end $$;

revoke execute on function public._unmask_client(uuid, jsonb), public._sees_contact(uuid) from public, anon, authenticated;
grant execute on function public._viewer_email(uuid, text), public._is_masked(text) to authenticated;

-- 2. Reads ------------------------------------------------------------------------------------------
-- Rewritten from their current text so nothing else in them changes; fails loudly if the text moved.
do $mig$
declare d text; n text;
begin
  -- calendar list: desk roles get the phone through _viewer_phone (owner = full)
  select pg_get_functiondef('public.appt_list(uuid, timestamptz, timestamptz)'::regprocedure) into d;
  n := replace(d, $s$'phone', case when me.desk then c.phone else '' end$s$,
                  $s$'phone', case when me.desk then public._viewer_phone(p_salon, c.phone) else '' end$s$);
  if n = d then raise exception 'appt_list: phone line not found'; end if;
  execute n;

  -- client profile: email hidden too
  select pg_get_functiondef('public.client_profile(uuid)'::regprocedure) into d;
  n := replace(d, $s$'email', c.email,$s$, $s$'email', public._viewer_email(c.salon_id, c.email),$s$);
  if n = d then raise exception 'client_profile: email line not found'; end if;
  execute n;

  -- client search: the owner any digits; desk roles 7+ digits or the exact last 4; others the exact last 4
  select pg_get_functiondef('public.client_list(uuid, text, text)'::regprocedure) into d;
  n := replace(d, $s$(public._is_desk(p_salon) or (length(digits) = 4$s$,
                  $s$(public._sees_contact(p_salon) or (public._is_desk(p_salon) and length(digits) >= 7) or (length(digits) = 4$s$);
  if n = d then raise exception 'client_list: phone search not found'; end if;
  execute n;

  -- a tech's regulars: phone hidden (it gave techs the full number)
  select pg_get_functiondef('public.my_regulars(uuid)'::regprocedure) into d;
  n := replace(d, $s$'phone', c.phone,$s$, $s$'phone', public._viewer_phone(p_salon, c.phone),$s$);
  if n = d then raise exception 'my_regulars: phone line not found'; end if;
  execute n;
end $mig$;

-- Tickets read their client's contact here (the browser can no longer read clients.phone/email).
create or replace function public.ticket_contacts(p_salon uuid, p_clients uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'phone', public._viewer_phone(p_salon, c.phone),
           'email', public._viewer_email(p_salon, c.email))), '[]'::jsonb)
  from public.clients c
  where public._is_desk(p_salon) and c.salon_id = p_salon and c.id = any (coalesce(p_clients, '{}'));
$$;
revoke execute on function public.ticket_contacts(uuid, uuid[]) from public, anon;
grant execute on function public.ticket_contacts(uuid, uuid[]) to authenticated;

-- Direct table reads: every column but phone + email.
revoke select on public.clients from anon, authenticated;
grant select (id, salon_id, name, language, texts_ok, notes, created_at, archived_at, birthday, usual_staff,
  shape, colors, care, updated_at, care_by, care_at, number) on public.clients to authenticated;

-- 3. Writes: a hidden value sent back = the client on file --------------------------------------
do $mig$
declare d text; n text;
begin
  select pg_get_functiondef('public.save_ticket(jsonb)'::regprocedure) into d;
  n := replace(d, $s$begin
  if tid is null or sid is null then$s$, $s$begin
  if jsonb_typeof(p->'client') = 'object' then p := jsonb_set(p, '{client}', public._unmask_client(sid, p->'client')); end if;
  if tid is null or sid is null then$s$);
  if n = d then raise exception 'save_ticket: start not found'; end if;
  execute n;

  select pg_get_functiondef('public.appt_save(jsonb)'::regprocedure) into d;
  n := replace(d, $s$begin
  if aid is null or sid is null then$s$, $s$begin
  if jsonb_typeof(p->'client') = 'object' then p := jsonb_set(p, '{client}', public._unmask_client(sid, p->'client')); end if;
  if aid is null or sid is null then$s$);
  if n = d then raise exception 'appt_save: start not found'; end if;
  execute n;

  -- tech books a regular whose phone is hidden: the app sends clientId
  select pg_get_functiondef('public.staff_book(jsonb)'::regprocedure) into d;
  n := replace(d, $s$begin
  if me is null then raise exception 'not allowed'; end if;$s$, $s$begin
  if me is null then raise exception 'not allowed'; end if;
  if public._is_masked(p->>'phone') then
    p := p || jsonb_build_object('phone', coalesce((select c.phone from public.clients c
      where c.id = nullif(p->>'clientId', '')::uuid and c.salon_id = sid), ''));
  end if;$s$);
  if n = d then raise exception 'staff_book: start not found'; end if;
  execute n;

  -- client edit: a hidden phone/email = unchanged
  select pg_get_functiondef('public.client_save(jsonb)'::regprocedure) into d;
  n := replace(d, $s$begin
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;$s$, $s$begin
  if public._is_masked(p->>'phone') then p := p - 'phone'; end if;
  if public._is_masked(p->>'email') then p := p - 'email'; end if;
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;$s$);
  if n = d then raise exception 'client_save: start not found'; end if;
  execute n;

  -- receipt "on file": the app only knows ••7011, the server sends to the real number / email
  select pg_get_functiondef('public.log_receipt(uuid, uuid, uuid, text, text)'::regprocedure) into d;
  n := replace(d, $s$begin
  if not public._is_desk(p_salon) then raise exception 'not allowed'; end if;$s$, $s$begin
  if not public._is_desk(p_salon) then raise exception 'not allowed'; end if;
  if public._is_masked(p_to) then
    select case when p_channel = 'email' then c.email else c.phone end into p_to
    from public.tickets t join public.clients c on c.id = t.client_id
    where t.id = p_ticket and t.salon_id = p_salon and c.salon_id = p_salon;
    addr := lower(trim(coalesce(p_to, '')));
  end if;$s$);
  if n = d then raise exception 'log_receipt: start not found'; end if;
  execute n;
end $mig$;

-- 4. Lookups by phone also take the client id (the desk may only know ••7011) ---------------------
drop function if exists public.gift_find(uuid, text);
create function public.gift_find(p_salon uuid, p_phone text, p_client uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ph as (
    select coalesce(nullif(case when public._is_masked(p_phone) then '' else p_phone end, ''),
                    (select c.phone from public.clients c where c.id = p_client and c.salon_id = p_salon), '') as v
  )
  select coalesce(jsonb_agg(public._gift_card_json(g.id) order by g.status = 'active' desc, g.sold_at desc), '[]'::jsonb)
  from ph, public.gift_cards g left join public.clients c on c.id = g.client_id
  where public._is_desk(p_salon) and g.salon_id = p_salon and ph.v <> ''
    and (c.phone = ph.v or g.sent_to = ph.v) and g.status in ('active', 'locked', 'replaced', 'used_up');
$$;

drop function if exists public.loyalty_for_client(uuid, text);
create function public.loyalty_for_client(p_salon uuid, p_phone text, p_client uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ph as (
    select coalesce(nullif(case when public._is_masked(p_phone) then '' else p_phone end, ''),
                    (select c.phone from public.clients c where c.id = p_client and c.salon_id = p_salon), '') as v
  )
  select case when public._is_desk(p_salon) and l.on_ then jsonb_build_object(
    'clientId', c.id, 'points', public._client_points(c.id), 'kind', l.kind, 'pointsPerDollar', l.points_per_dollar, 'rewardPoints', l.reward_points, 'rewardCents', l.reward_cents,
    'ready', public._client_points(c.id) >= l.reward_points) end
  from ph, public.loyalty_settings l join public.clients c on c.salon_id = l.salon_id
  where l.salon_id = p_salon and ph.v <> '' and c.phone = ph.v;
$$;

revoke execute on function public.gift_find(uuid, text, uuid), public.loyalty_for_client(uuid, text, uuid) from public, anon;
grant execute on function public.gift_find(uuid, text, uuid), public.loyalty_for_client(uuid, text, uuid) to authenticated;

-- 5. Call / Text hands out the number only to a role the owner switched on --------------------------
-- p_by (the PIN'd person on a salon device) must have typed their PIN on this salon in the last 12h,
-- so nobody can borrow the owner's role by sending the owner's membership id.
create or replace function public.client_contact_log(p_salon uuid, p_client uuid, p_appt uuid, p_way text, p_by uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare role text; mid uuid; s jsonb; own uuid; ph text;
begin
  if p_way not in ('call', 'text') then raise exception 'bad way' using errcode = '22023'; end if;
  if not public.is_member(p_salon) then raise exception 'not allowed' using errcode = '42501'; end if;
  select m.id into own from public.memberships m
    where m.salon_id = p_salon and m.archived_at is null and m.person_id = public.my_person_id() limit 1;
  select m.id, m.role into mid, role from public.memberships m
    where m.salon_id = p_salon and m.archived_at is null and m.id = coalesce(p_by, own)
    limit 1;
  if mid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if mid is distinct from own and not exists (
      select 1 from public.audit_log a where a.salon_id = p_salon and a.action = 'pin.ok'
        and a.detail->>'membership' = mid::text and a.at > now() - interval '12 hours') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select contact_settings into s from public.salons where id = p_salon;
  if role <> 'owner' and not (role = any (public._contact_roles(s, p_way))) then
    raise exception 'The owner has turned this off for your role' using errcode = '42501';
  end if;
  select c.phone into ph from public.clients c
    where c.salon_id = p_salon and c.id = coalesce(p_client,
      (select a.client_id from public.appointments a where a.id = p_appt and a.salon_id = p_salon));
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (p_salon, public.my_person_id(), case p_way when 'call' then 'client.called' else 'client.texted' end,
          jsonb_build_object('client', p_client, 'appointment', p_appt, 'membership', mid, 'role', role));
  return jsonb_build_object('ok', true, 'phone', coalesce(ph, ''));
end $$;

-- 6. "Show" on the client profile = owner only (the owner already gets the full number) ----------
create or replace function public.client_phone_viewed(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.clients;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null or not public._sees_contact(c.salon_id) then raise exception 'not allowed'; end if;
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (c.salon_id, public.my_person_id(), 'client.phone_viewed', jsonb_build_object('client', c.id));
end $$;

-- 7. Ticket client lookup: also by client id (a ticket that only knows ••7011); phone hidden unless owner.
drop function if exists public.client_lookup(uuid, text);
create function public.client_lookup(p_salon uuid, p_phone text, p_client uuid default null)
returns table (client_id uuid, name text, phone text, notes text, visits integer, avg_cents bigint, last_visit timestamptz, last_services text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, public._viewer_phone(p_salon, c.phone), c.notes,
    (select count(*)::int from public.tickets t where t.client_id = c.id and t.status = 'paid'),
    (select coalesce(round(avg(t.subtotal_cents - t.discount_cents)), 0)::bigint from public.tickets t where t.client_id = c.id and t.status = 'paid'),
    lt.paid_at,
    (select string_agg(l.name || coalesce(' with ' || m.display_name, ''), ', ' order by l.sort)
       from public.ticket_lines l left join public.memberships m on m.id = l.staff_id
       where l.ticket_id = lt.id and l.kind = 'service' and l.removed_at is null)
  from public.clients c
  left join lateral (select t.id, t.paid_at from public.tickets t where t.client_id = c.id and t.status = 'paid' order by t.paid_at desc limit 1) lt on true
  where c.salon_id = p_salon and c.archived_at is null and public._is_desk(p_salon)
    and (case when public._is_masked(p_phone) or coalesce(p_phone, '') = '' then c.id = p_client else c.phone = p_phone end);
$$;
revoke execute on function public.client_lookup(uuid, text, uuid) from public, anon;
grant execute on function public.client_lookup(uuid, text, uuid) to authenticated;
