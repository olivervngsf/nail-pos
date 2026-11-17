-- Ticket slip flow: front desk prints a slip with a QR → tech scans it on their phone and adds the services they did →
-- front desk scans the slip back and charges. Desk and tech change the same open ticket, so:
-- 1. save_ticket only removes lines the desk has SEEN (p.seen); lines a tech added since are kept.
--    (Same function as before incl. gift cards; only the removal line changes. Without p.seen it behaves as before.)
-- 2. tech_add_service / tech_remove_line: any member of the salon adds a service to an open ticket under their own name.

CREATE OR REPLACE FUNCTION public.save_ticket(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  tid uuid := (p->>'id')::uuid;
  sid uuid := (p->>'salonId')::uuid;
  t public.tickets;
  cid uuid;
  ln jsonb; i int := 0; keep uuid[] := '{}';
  sub bigint; disc bigint; tip bigint; gift bigint; total bigint; given bigint; left_due bigint;
  gc public.gift_cards; gs jsonb;
begin
  if tid is null or sid is null then raise exception 'ticket id and salon required'; end if;
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;
  select * into t from public.tickets where id = tid for update;
  if t.id is not null and t.salon_id <> sid then raise exception 'not allowed'; end if;
  if t.id is not null and t.status <> 'open' then
    return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status);
  end if;
  select gift_settings into gs from public.salons where id = sid;
  if coalesce(p->'client'->>'phone', '') <> '' then
    insert into public.clients (salon_id, phone, name) values (sid, p->'client'->>'phone', coalesce(p->'client'->>'name', ''))
    on conflict (salon_id, phone) do update set name = coalesce(nullif(excluded.name, ''), public.clients.name)
    returning id into cid;
  end if;
  if t.id is null then
    insert into public.ticket_counters (salon_id) values (sid) on conflict (salon_id) do update set last = public.ticket_counters.last + 1;
    insert into public.tickets (id, salon_id, number, client_id, note, opened_by, device_id, created_at)
    values (tid, sid, (select last from public.ticket_counters where salon_id = sid), cid, coalesce(p->>'note', ''),
            public._salon_member(sid, (p->>'openedBy')::uuid),
            (select id from public.devices where id = (p->>'deviceId')::uuid and salon_id = sid),
            least(now(), coalesce((p->>'createdAt')::timestamptz, now())))
    returning * into t;
  else
    update public.tickets set client_id = cid, note = coalesce(p->>'note', ''), updated_at = now() where id = tid returning * into t;
  end if;
  for ln in select * from jsonb_array_elements(coalesce(p->'lines', '[]')) loop
    i := i + 1;
    if ln->>'kind' not in ('service', 'discount', 'tip', 'gift_sale') then raise exception 'bad line'; end if;
    if ln->>'kind' = 'discount' then
      if not exists (select 1 from public.discount_approvals a where a.id = (ln->>'approvalId')::uuid and a.salon_id = sid and a.at > now() - interval '12 hours')
      then raise exception 'discount needs a manager PIN'; end if;
      if (ln->>'cents')::bigint > 0 then raise exception 'discount must take money off'; end if;
    elsif (ln->>'cents')::bigint < 0 then raise exception 'amount can''t be below $0';
    end if;
    if ln->>'kind' = 'gift_sale' then
      select * into gc from public.gift_cards where id = (ln->>'giftCardId')::uuid and salon_id = sid;
      if gc.id is null or gc.status not in ('in_stock', 'active', 'used_up') then raise exception 'gift card can''t be sold'; end if;
      if gc.status = 'in_stock' and (ln->>'cents')::bigint < coalesce((gs->>'min_cents')::bigint, 100) then raise exception 'gift card amount too small'; end if;
      if public._gift_balance(gc.id) + (ln->>'cents')::bigint > coalesce((gs->>'max_cents')::bigint, 100000) then raise exception 'gift card amount too big'; end if;
    end if;
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, service_id, staff_id, name, minutes, amount_cents, price_from, reason, approval_id, gift_card_id, sort)
    values ((ln->>'id')::uuid, sid, tid, ln->>'kind',
            (select id from public.services where id = (ln->>'serviceId')::uuid and salon_id = sid),
            case when ln->>'kind' = 'gift_sale' then null else public._salon_member(sid, (ln->>'staffId')::uuid) end,
            coalesce(ln->>'name', ''), (ln->>'minutes')::int, (ln->>'cents')::bigint, coalesce((ln->>'priceFrom')::boolean, false),
            ln->>'reason', (ln->>'approvalId')::uuid, case when ln->>'kind' = 'gift_sale' then gc.id end, i)
    on conflict (id) do update set kind = excluded.kind, service_id = excluded.service_id, staff_id = excluded.staff_id, name = excluded.name,
      minutes = excluded.minutes, amount_cents = excluded.amount_cents, price_from = excluded.price_from, reason = excluded.reason,
      approval_id = excluded.approval_id, gift_card_id = excluded.gift_card_id, sort = excluded.sort, removed_at = null
    where public.ticket_lines.ticket_id = tid;
    keep := keep || (ln->>'id')::uuid;
  end loop;
  -- Only remove lines this desk has seen; lines a tech added from their phone since stay.
  update public.ticket_lines set removed_at = now() where ticket_id = tid and removed_at is null and not (id = any (keep)) and name <> 'Card tip'
    and (not (p ? 'seen') or id in (select (jsonb_array_elements_text(p->'seen'))::uuid));
  select coalesce(sum(amount_cents) filter (where kind = 'service'), 0),
         coalesce(-sum(amount_cents) filter (where kind = 'discount'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'tip'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'gift_sale'), 0)
    into sub, disc, tip, gift from public.ticket_lines where ticket_id = tid and removed_at is null;
  disc := least(disc, sub);
  total := sub - disc + tip + gift;
  update public.tickets set subtotal_cents = sub, discount_cents = disc, tip_cents = tip, gift_cents = gift, total_cents = total where id = tid;
  if p ? 'payment' and p->'payment' is not null and jsonb_typeof(p->'payment') = 'object' then
    if p->'payment'->>'method' <> 'cash' then raise exception 'only cash here'; end if;
    if exists (select 1 from public.ticket_lines where ticket_id = tid and removed_at is null and kind = 'service' and staff_id is null) then
      raise exception 'every service needs a staff member';
    end if;
    left_due := public._ticket_left(tid);
    given := (p->'payment'->>'givenCents')::bigint;
    if given is null or given < left_due then raise exception 'cash given is less than the total'; end if;
    insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, given_cents, change_cents, taken_by, device_id, at)
    values ((p->'payment'->>'id')::uuid, sid, tid, 'cash', left_due, tip, given, given - left_due,
            public._salon_member(sid, (p->'payment'->>'takenBy')::uuid), t.device_id,
            least(now(), coalesce((p->'payment'->>'at')::timestamptz, now())))
    on conflict (id) do nothing;
    update public.tickets set status = 'paid', paid_at = least(now(), coalesce((p->'payment'->>'at')::timestamptz, now())),
      paid_by = public._salon_member(sid, (p->'payment'->>'takenBy')::uuid), updated_at = now()
    where id = tid returning * into t;
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (sid, public.my_person_id(), 'ticket.paid', jsonb_build_object('ticket', tid, 'number', t.number, 'total_cents', total, 'method', 'cash'));
  end if;
  return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status, 'left_cents', public._ticket_left(tid));
end $function$;

-- Tech adds a service they did to an open ticket (from the slip QR), under their own name. Same line id twice = once.
create function public.tech_add_service(p_ticket uuid, p_line uuid, p_service uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; mid uuid; sv public.services; n int;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if t.id is null or not public.is_member(t.salon_id) then raise exception 'not allowed'; end if;
  if t.status <> 'open' then raise exception 'this ticket is already paid'; end if;
  select m.id into mid from public.memberships m where m.salon_id = t.salon_id and m.person_id = public.my_person_id() and m.archived_at is null;
  select * into sv from public.services where id = p_service and salon_id = t.salon_id and archived_at is null;
  if mid is null or sv.id is null then raise exception 'not allowed'; end if;
  select coalesce(max(sort), 0) + 1 into n from public.ticket_lines where ticket_id = t.id;
  insert into public.ticket_lines (id, salon_id, ticket_id, kind, service_id, staff_id, name, minutes, amount_cents, price_from, sort)
  values (p_line, t.salon_id, t.id, 'service', sv.id, mid, sv.name, sv.minutes, sv.price_cents, sv.price_from, n)
  on conflict (id) do nothing;
  update public.tickets set subtotal_cents = (select coalesce(sum(amount_cents), 0) from public.ticket_lines where ticket_id = t.id and kind = 'service' and removed_at is null),
    updated_at = now() where id = t.id;
  return jsonb_build_object('ok', true);
end $$;

-- Tech takes back a service they added by mistake (only their own, only while the ticket is open).
create function public.tech_remove_line(p_ticket uuid, p_line uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; mid uuid;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if t.id is null or not public.is_member(t.salon_id) then raise exception 'not allowed'; end if;
  if t.status <> 'open' then raise exception 'this ticket is already paid'; end if;
  select m.id into mid from public.memberships m where m.salon_id = t.salon_id and m.person_id = public.my_person_id() and m.archived_at is null;
  update public.ticket_lines set removed_at = now() where id = p_line and ticket_id = t.id and staff_id = mid and kind = 'service' and removed_at is null;
  update public.tickets set subtotal_cents = (select coalesce(sum(amount_cents), 0) from public.ticket_lines where ticket_id = t.id and kind = 'service' and removed_at is null),
    updated_at = now() where id = t.id;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.tech_add_service(uuid, uuid, uuid), public.tech_remove_line(uuid, uuid) from public, anon;
grant execute on function public.tech_add_service(uuid, uuid, uuid), public.tech_remove_line(uuid, uuid) to authenticated;
