-- Tickets for clients with no phone (Oliver, Nov 17). Phone stays the normal way (salons always ask for it: reminders,
-- fewer no-shows), but a ticket no longer loses who it was for:
--  * tickets.client_name: the name on the ticket, kept even with no phone (walk-in "Nam"), shown on receipts/history.
--  * save_ticket: client.id (picked from the Clients list) links the ticket to that client when there's no phone;
--    a phone still finds/creates the client as before. Same body as the live version otherwise.

alter table public.tickets add column client_name text not null default '';

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
  cname text := left(trim(coalesce(p->'client'->>'name', '')), 120);
  ln jsonb; i int := 0; keep uuid[] := '{}';
  sub bigint; disc bigint; tip bigint; gift bigint; total bigint; given bigint; left_due bigint;
  gc public.gift_cards; gs jsonb; ly public.loyalty_settings; rewards int := 0;
begin
  if tid is null or sid is null then raise exception 'ticket id and salon required'; end if;
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;

  select * into t from public.tickets where id = tid for update;
  if t.id is not null and t.salon_id <> sid then raise exception 'not allowed'; end if;
  if t.id is not null and t.status <> 'open' then
    return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status);
  end if;
  select gift_settings into gs from public.salons where id = sid;
  select * into ly from public.loyalty_settings where salon_id = sid;

  if coalesce(p->'client'->>'phone', '') <> '' then
    insert into public.clients (salon_id, phone, name) values (sid, p->'client'->>'phone', coalesce(p->'client'->>'name', ''))
    on conflict (salon_id, phone) do update set name = coalesce(nullif(public.clients.name, ''), excluded.name) -- never renames a client
    returning id into cid;
  elsif coalesce(p->'client'->>'id', '') <> '' then
    -- No phone: the client picked from the list (must be in this salon).
    select c.id into cid from public.clients c where c.id = (p->'client'->>'id')::uuid and c.salon_id = sid;
  end if;

  if t.id is null then
    insert into public.ticket_counters (salon_id) values (sid) on conflict (salon_id) do update set last = public.ticket_counters.last + 1;
    insert into public.tickets (id, salon_id, number, client_id, client_name, note, opened_by, device_id, created_at)
    values (tid, sid, (select last from public.ticket_counters where salon_id = sid), cid, cname, coalesce(p->>'note', ''),
            public._salon_member(sid, (p->>'openedBy')::uuid),
            (select id from public.devices where id = (p->>'deviceId')::uuid and salon_id = sid),
            least(now(), coalesce((p->>'createdAt')::timestamptz, now())))
    returning * into t;
  else
    update public.tickets set client_id = cid, client_name = cname, note = coalesce(p->>'note', ''), updated_at = now() where id = tid returning * into t;
  end if;

  for ln in select * from jsonb_array_elements(coalesce(p->'lines', '[]')) loop
    i := i + 1;
    if ln->>'kind' not in ('service', 'discount', 'tip', 'gift_sale', 'loyalty_reward') then raise exception 'bad line'; end if;
    if ln->>'kind' = 'loyalty_reward' then
      -- A loyalty reward: the client asked to use it. Exactly the salon's reward, once per ticket, only with enough points.
      rewards := rewards + 1;
      if ly.salon_id is null or not ly.on_ then raise exception 'loyalty is off'; end if;
      if cid is null then raise exception 'a reward needs the client''s phone'; end if;
      if rewards > 1 then raise exception 'one reward per visit'; end if;
      if (ln->>'cents')::bigint <> -ly.reward_cents then raise exception 'reward amount changed'; end if;
      if public._client_points(cid) < ly.reward_points then raise exception 'not enough points for a reward'; end if;
    end if;
    if ln->>'kind' = 'discount' then
      -- First use binds the OK to this ticket; later saves of the same ticket keep working (even after a long offline stretch).
      update public.discount_approvals set ticket_id = tid, used_at = coalesce(used_at, now())
      where id = (ln->>'approvalId')::uuid and salon_id = sid and purpose = 'discount'
        and (ticket_id = tid or (ticket_id is null and at > now() - interval '12 hours'));
      if not found then raise exception 'discount needs a manager PIN'; end if;
      if (ln->>'cents')::bigint > 0 then raise exception 'discount must take money off'; end if;
    elsif ln->>'kind' <> 'loyalty_reward' and (ln->>'cents')::bigint < 0 then raise exception 'amount can''t be below $0';
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
  -- Card tips come from Stripe, not the device: keep them.
  -- Ticket slip: only remove lines this desk has seen (p.seen); lines a tech added from their phone since stay.
  -- (Brought back: the review-fixes version of save_ticket had dropped this rule.)
  update public.ticket_lines set removed_at = now() where ticket_id = tid and removed_at is null and not (id = any (keep)) and name <> 'Card tip'
    and (not (p ? 'seen') or id in (select (jsonb_array_elements_text(p->'seen'))::uuid));

  select coalesce(sum(amount_cents) filter (where kind = 'service'), 0),
         coalesce(-sum(amount_cents) filter (where kind in ('discount', 'loyalty_reward')), 0),
         coalesce(sum(amount_cents) filter (where kind = 'tip'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'gift_sale'), 0)
    into sub, disc, tip, gift from public.ticket_lines where ticket_id = tid and removed_at is null;
  disc := least(disc, sub);
  total := sub - disc + tip + gift;
  update public.tickets set subtotal_cents = sub, discount_cents = disc, tip_cents = tip, gift_cents = gift, total_cents = total where id = tid;

  -- What's owed changed while a card try waits: that try is no longer for this ticket.
  update public.pay_requests set status = 'canceled', error = 'ticket changed', updated_at = now()
  where ticket_id = tid and status = 'pending' and amount_cents <> public._card_due(tid);

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
    update public.pay_requests set status = 'canceled', error = 'paid another way', updated_at = now() where ticket_id = tid and status = 'pending';
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (sid, public.my_person_id(), 'ticket.paid', jsonb_build_object('ticket', tid, 'number', t.number, 'total_cents', total, 'method', 'cash'));
  end if;

  return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status, 'left_cents', public._ticket_left(tid));
end $function$;
