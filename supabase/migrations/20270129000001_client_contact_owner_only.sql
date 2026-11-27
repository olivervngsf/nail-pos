-- Client phone + email = OWNER ONLY (Oliver, Nov 26). Before: the screens hid them, but the full values still
-- reached managers, front desk and techs (client profile email, tech "My regulars" phone, calendar, ticket pull,
-- direct reads of the clients table).
-- Now:
--   * owner's login: full phone + email, as before.
--   * everyone else: phone = ••7011, email = first 4 letters + •••@domain (mari•••@gmail.com).
--   * Call / Text offline: the calendar row carries a hidden `dial` number ONLY for roles the owner turned on in
--     Settings → Call + text clients (never shown, never in search or lists, never an email).
--   * A hidden value sent back by a device (ticket, booking, client edit, receipt "on file") never overwrites the real one:
--     saves fall back to the client id, receipts send to the number/email on file.
--   * The desk can still type a full phone to find/add a client (client_lookup answers with what they typed).

-- ---------- helpers ----------
create or replace function public._masked(v text) returns boolean
language sql immutable set search_path = '' as $$ select position('•' in coalesce(v, '')) > 0 $$;

create or replace function public._mask_phone(p text) returns text
language sql immutable set search_path = '' as $$
  select case when coalesce(p, '') = '' then coalesce(p, '') else '••' || right(regexp_replace(p, '\D', '', 'g'), 4) end $$;

create or replace function public._mask_email(e text) returns text
language sql immutable set search_path = '' as $$
  select case when coalesce(e, '') = '' or position('@' in e) = 0 then coalesce(e, '')
    else left(split_part(e, '@', 1), least(4, greatest(1, length(split_part(e, '@', 1)) - 1))) || '•••@' || split_part(e, '@', 2) end $$;

-- Phone / email as this caller may see them: full for the owner only.
create or replace function public._viewer_phone(p_salon uuid, p_phone text) returns text
language sql stable security definer set search_path = '' as $$
  select case when public.is_owner(p_salon) then coalesce(p_phone, '') else public._mask_phone(p_phone) end $$;

create or replace function public._viewer_email(p_salon uuid, p_email text) returns text
language sql stable security definer set search_path = '' as $$
  select case when public.is_owner(p_salon) then coalesce(p_email, '') else public._mask_email(p_email) end $$;

-- May this caller's device hold numbers for the Call / Text buttons? Owner always; others only when the owner
-- turned Call or Text on for their role (QR front desk devices count as front desk).
create or replace function public._can_dial(p_salon uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner(p_salon) or exists (
    select 1 from public.salons s
    where s.id = p_salon and coalesce(
      (select m.role from public.memberships m join public.people pp on pp.id = m.person_id
        where m.salon_id = p_salon and pp.auth_user_id = (select auth.uid()) and m.archived_at is null limit 1),
      case when public._device_of(p_salon, array['front_desk']) then 'front_desk' end)
      = any (public._contact_roles(s.contact_settings, 'call') || public._contact_roles(s.contact_settings, 'text')))
$$;

revoke execute on function public._viewer_phone(uuid, text), public._viewer_email(uuid, text), public._can_dial(uuid) from public, anon;
grant execute on function public._viewer_phone(uuid, text), public._viewer_email(uuid, text), public._can_dial(uuid) to authenticated;

-- ---------- a hidden value never overwrites the real one ----------
create or replace function public._clients_keep_contact() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public._masked(new.phone) then new.phone := case when tg_op = 'UPDATE' then old.phone end; end if;
  if public._masked(new.email) then new.email := case when tg_op = 'UPDATE' then old.email end; end if;
  return new;
end $$;
drop trigger if exists clients_keep_contact on public.clients;
create trigger clients_keep_contact before insert or update of phone, email on public.clients
  for each row execute function public._clients_keep_contact();

-- ---------- no direct reads of phone / email ----------
revoke select on public.clients from anon, authenticated;
grant select (id, salon_id, name, language, texts_ok, notes, created_at, archived_at, birthday, usual_staff,
  shape, colors, care, updated_at, care_by, care_at, number) on public.clients to authenticated;

-- Ticket pull: phone + email of the tickets' clients, as this caller may see them.
create or replace function public.ticket_clients(p_salon uuid, p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'phone', public._viewer_phone(p_salon, c.phone),
    'email', public._viewer_email(p_salon, c.email))), '[]'::jsonb)
  from public.clients c where c.salon_id = p_salon and c.id = any (p_ids) and public._is_desk(p_salon);
$$;
revoke execute on function public.ticket_clients(uuid, uuid[]) from public, anon;
grant execute on function public.ticket_clients(uuid, uuid[]) to authenticated;

-- ---------- reads ----------
-- Calendar: phone as the caller may see it + hidden `dial` for the Call / Text buttons.
create or replace function public.appt_list(p_salon uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (
    select public._is_desk(p_salon) as desk, public.is_owner(p_salon) as owner, public._can_dial(p_salon) as dial,
      (select m.id from public.memberships m where m.salon_id = p_salon and m.person_id = public.my_person_id() and m.archived_at is null) as mid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'start', a.start_at, 'end', a.end_at, 'staffId', a.staff_id, 'status', a.status, 'source', a.source, 'note', a.note,
    'services', a.services, 'ticketId', a.ticket_id, 'repeatRuleId', a.repeat_rule_id, 'updatedAt', a.updated_at,
    'arrivedAt', a.arrived_at, 'seatReason', a.seat_reason,
    'client', case when a.client_id is null then jsonb_build_object('name', a.client_name, 'phone', '')
              else jsonb_build_object('id', c.id, 'name', coalesce(nullif(c.name, ''), a.client_name),
                'phone', case when me.owner then coalesce(c.phone, '') when me.desk then public._mask_phone(c.phone) else '' end,
                'dial', case when me.dial and coalesce(c.phone, '') <> '' then c.phone end,
                'care', c.care <> '', 'textsOk', c.texts_ok) end,
    'ticketStatus', (select t.status from public.tickets t where t.id = a.ticket_id)
  ) order by a.start_at), '[]'::jsonb)
  from me, public.appointments a left join public.clients c on c.id = a.client_id
  where a.salon_id = p_salon and public.is_member(p_salon) and a.start_at < p_to and a.end_at > p_from
    and (me.desk or a.staff_id = me.mid);
$$;

-- Tech "My regulars": no full phone (they pick by id now).
create or replace function public.my_regulars(p_salon uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(r order by (r->>'visits')::int desc), '[]') from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'phone', public._viewer_phone(p_salon, c.phone), 'visits', count(distinct t.id), 'last', max(t.paid_at),
      'service', (array_agg(l.name order by t.paid_at desc))[1], 'serviceId', (array_agg(l.service_id order by t.paid_at desc))[1]) r
    from public.ticket_lines l join public.tickets t on t.id = l.ticket_id join public.clients c on c.id = t.client_id
    where l.salon_id = p_salon and l.staff_id = public._me_in(p_salon) and l.kind = 'service' and l.removed_at is null and t.status = 'paid'
    group by c.id, c.name, c.phone order by count(distinct t.id) desc limit 12) z;
$$;

-- Gift cards + loyalty: find by client id (the device may only hold ••7011).
drop function if exists public.gift_find(uuid, text);
create or replace function public.gift_find(p_salon uuid, p_phone text, p_client uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public._gift_card_json(g.id) order by g.status = 'active' desc, g.sold_at desc), '[]'::jsonb)
  from public.gift_cards g left join public.clients c on c.id = g.client_id
  where public._is_desk(p_salon) and g.salon_id = p_salon
    and ((p_client is not null and g.client_id = p_client)
      or (coalesce(p_phone, '') <> '' and not public._masked(p_phone) and (c.phone = p_phone or g.sent_to = p_phone)))
    and g.status in ('active', 'locked', 'replaced', 'used_up');
$$;
revoke execute on function public.gift_find(uuid, text, uuid) from public, anon;
grant execute on function public.gift_find(uuid, text, uuid) to authenticated;

drop function if exists public.loyalty_for_client(uuid, text);
create or replace function public.loyalty_for_client(p_salon uuid, p_phone text, p_client uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public._is_desk(p_salon) and l.on_ then jsonb_build_object(
    'clientId', c.id, 'points', public._client_points(c.id), 'kind', l.kind, 'pointsPerDollar', l.points_per_dollar, 'rewardPoints', l.reward_points, 'rewardCents', l.reward_cents,
    'ready', public._client_points(c.id) >= l.reward_points) end
  from public.loyalty_settings l join public.clients c on c.salon_id = l.salon_id
    and ((p_client is not null and c.id = p_client) or (p_client is null and not public._masked(p_phone) and c.phone = p_phone))
  where l.salon_id = p_salon;
$$;
revoke execute on function public.loyalty_for_client(uuid, text, uuid) from public, anon;
grant execute on function public.loyalty_for_client(uuid, text, uuid) to authenticated;

-- ---------- patches to longer functions (exact line swaps; stops loudly if a line moved) ----------
do $$
declare d text; n text;
begin
  -- client_profile: email as the caller may see it.
  select pg_get_functiondef('public.client_profile(uuid)'::regprocedure) into d;
  n := replace(d, $q$'email', c.email,$q$, $q$'email', public._viewer_email(c.salon_id, c.email),$q$);
  if n = d then raise exception 'client_profile: email line not found'; end if;
  execute n;

  -- save_ticket: a hidden phone is no phone (the client id links it).
  select pg_get_functiondef('public.save_ticket(jsonb)'::regprocedure) into d;
  n := replace(d, $q$if coalesce(p->'client'->>'phone', '') <> '' then$q$,
                  $q$if coalesce(p->'client'->>'phone', '') <> '' and not public._masked(p->'client'->>'phone') then$q$);
  if n = d then raise exception 'save_ticket: phone line not found'; end if;
  execute n;

  -- appt_save: same, plus link by client id when there is no (real) phone.
  select pg_get_functiondef('public.appt_save(jsonb)'::regprocedure) into d;
  n := replace(d, $q$if coalesce(p->'client'->>'phone', '') <> '' then$q$,
                  $q$if coalesce(p->'client'->>'phone', '') <> '' and not public._masked(p->'client'->>'phone') then$q$);
  n := replace(n, $q$returning id into cid;
  end if;
  if p->'repeat'$q$, $q$returning id into cid;
  elsif coalesce(p->'client'->>'id', '') <> '' then
    select c.id into cid from public.clients c where c.id = (p->'client'->>'id')::uuid and c.salon_id = sid;
  end if;
  if p->'repeat'$q$);
  if n = d or position('elsif coalesce(p->''client''->>''id''' in n) = 0 then raise exception 'appt_save: client lines not found'; end if;
  execute n;

  -- staff_book: tech picks a regular by id.
  select pg_get_functiondef('public.staff_book(jsonb)'::regprocedure) into d;
  n := replace(d, $q$on conflict (salon_id, phone) do update set name = coalesce(nullif(public.clients.name, ''), excluded.name) returning id into cid;
  end if;$q$, $q$on conflict (salon_id, phone) do update set name = coalesce(nullif(public.clients.name, ''), excluded.name) returning id into cid;
  elsif coalesce(p->>'clientId', '') <> '' then
    select c.id into cid from public.clients c where c.id = (p->>'clientId')::uuid and c.salon_id = sid;
  end if;$q$);
  if n = d then raise exception 'staff_book: client lines not found'; end if;
  execute n;

  -- log_receipt: "on file" with a hidden contact → the real one on file.
  select pg_get_functiondef('public.log_receipt(uuid, uuid, uuid, text, text)'::regprocedure) into d;
  n := replace(d, $q$if not exists (select 1 from public.tickets where id = p_ticket and salon_id = p_salon) then raise exception 'no such ticket'; end if;$q$,
    $q$if not exists (select 1 from public.tickets where id = p_ticket and salon_id = p_salon) then raise exception 'no such ticket'; end if;
  if public._masked(p_to) then
    select case p_channel when 'email' then c.email else c.phone end into p_to
    from public.tickets t join public.clients c on c.id = t.client_id where t.id = p_ticket and t.salon_id = p_salon;
    addr := lower(trim(coalesce(p_to, '')));
  end if;$q$);
  if n = d then raise exception 'log_receipt: ticket line not found'; end if;
  execute n;
end $$;
