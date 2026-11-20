-- Split payment (gap after M4, Nov 19): part cash, rest by card / pay link / gift card / more cash.
--  * cash_part: the desk takes some cash now; the ticket stays open and owes the rest. Same id twice = once (offline queue).
--  * cash_part_undo: take a part back off an open ticket (desk changed their mind; give the cash back).
--  * What's left on an open ticket = total − every payment already on it (gift cards + cash parts), everywhere:
--    _ticket_left (cash finish + gift cards), _card_due + pay_info (card reader, pay link, handheld app).
--  * Refund of a split ticket gives back every part (cash parts + card), not just the last one.
-- Cash parts carry no tip: tips go on the last payment (the screen says so).

create or replace function public._ticket_left(p_ticket uuid) returns bigint language sql stable set search_path = '' as $$
  select (t.total_cents - coalesce((select sum(amount_cents) from public.payments p
            where p.ticket_id = t.id and p.status = 'paid' and p.method in ('gift_card', 'cash')), 0))::bigint
  from public.tickets t where t.id = p_ticket $$;

create or replace function public._card_due(p_ticket uuid) returns bigint language sql stable set search_path = '' as $$
  select (greatest(coalesce(sum(l.amount_cents) filter (where l.kind = 'service'), 0)
                   - least(coalesce(-sum(l.amount_cents) filter (where l.kind in ('discount', 'loyalty_reward')), 0), coalesce(sum(l.amount_cents) filter (where l.kind = 'service'), 0)), 0)
          + coalesce(sum(l.amount_cents) filter (where l.kind = 'gift_sale'), 0)
          - coalesce((select sum(p.amount_cents) from public.payments p where p.ticket_id = p_ticket and p.method in ('gift_card', 'cash') and p.status = 'paid'), 0))::bigint
  from public.ticket_lines l where l.ticket_id = p_ticket and l.removed_at is null $$;

create or replace function public.pay_info(p_ticket uuid)
returns table (salon_id uuid, number int, status text, due_cents bigint, account_id text, charges_enabled boolean, salon_name text)
language plpgsql stable security definer set search_path = '' as $$
declare t public.tickets;
begin
  select * into t from public.tickets where id = p_ticket;
  if t.id is null or not public._is_desk(t.salon_id) then raise exception 'not allowed'; end if;
  return query select t.salon_id, t.number, t.status,
    t.subtotal_cents - t.discount_cents + t.gift_cents
      - coalesce((select sum(amount_cents) from public.payments p where p.ticket_id = t.id and p.method in ('gift_card', 'cash') and p.status = 'paid'), 0)::bigint,
    a.account_id, coalesce(a.charges_enabled, false), s.name
    from public.salons s left join public.stripe_accounts a on a.salon_id = s.id where s.id = t.salon_id;
end $$;

-- p: {paymentId, salonId, ticketId, cents, givenCents?, takenBy?, at?}
create function public.cash_part(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := (p->>'salonId')::uuid; tid uuid := (p->>'ticketId')::uuid; pid uuid := (p->>'paymentId')::uuid;
  t public.tickets; amt bigint := (p->>'cents')::bigint; given bigint; left_due bigint; by_m uuid;
begin
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;
  if exists (select 1 from public.payments where id = pid) then
    return jsonb_build_object('ok', true, 'repeat', true, 'left_cents', public._ticket_left(tid), 'status', (select status from public.tickets where id = tid));
  end if;
  select * into t from public.tickets where id = tid and salon_id = sid for update;
  if t.id is null then raise exception 'save the ticket first'; end if;
  if t.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'already_' || t.status); end if;
  if exists (select 1 from public.ticket_lines where ticket_id = tid and removed_at is null and kind = 'service' and staff_id is null) then
    raise exception 'every service needs a staff member';
  end if;
  left_due := public._ticket_left(tid);
  if amt is null or amt <= 0 then raise exception 'cash part must be more than $0'; end if;
  if amt >= left_due then raise exception 'that pays it all: use Cash received'; end if;
  given := greatest(coalesce((p->>'givenCents')::bigint, amt), amt);
  by_m := public._salon_member(sid, (p->>'takenBy')::uuid);
  insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, given_cents, change_cents, taken_by, device_id, at)
  values (pid, sid, tid, 'cash', amt, 0, given, given - amt, by_m, t.device_id, least(now(), coalesce((p->>'at')::timestamptz, now())));
  -- What a waiting card try must charge just went down: that try is no longer right.
  update public.pay_requests set status = 'canceled', error = 'part paid in cash', updated_at = now()
  where ticket_id = tid and status = 'pending' and amount_cents <> public._card_due(tid);
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (sid, public.my_person_id(), 'ticket.cash_part', jsonb_build_object('ticket', tid, 'number', t.number, 'cents', amt));
  return jsonb_build_object('ok', true, 'left_cents', left_due - amt, 'status', 'open');
end $$;

create function public.cash_part_undo(p_payment uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pay public.payments; t public.tickets;
begin
  select * into pay from public.payments where id = p_payment and method = 'cash' for update;
  if pay.id is null or not public._is_desk(pay.salon_id) then raise exception 'not allowed'; end if;
  if pay.status <> 'paid' then return jsonb_build_object('ok', true, 'repeat', true); end if;
  select * into t from public.tickets where id = pay.ticket_id for update;
  if t.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'already_' || t.status); end if;
  update public.payments set status = 'canceled' where id = pay.id;
  update public.pay_requests set status = 'canceled', error = 'cash part taken back', updated_at = now()
  where ticket_id = t.id and status = 'pending' and amount_cents <> public._card_due(t.id);
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (pay.salon_id, public.my_person_id(), 'ticket.cash_part_undo', jsonb_build_object('ticket', t.id, 'number', t.number, 'cents', pay.amount_cents));
  return jsonb_build_object('ok', true, 'left_cents', public._ticket_left(t.id));
end $$;

-- Refund: every cash/card part goes back (the card one with Stripe's refund id); gift card money goes back on the card
-- through the gift trigger. A ticket paid only by gift card records that payment, as before.
create or replace function public.settle_refund(p_ticket uuid, p_stripe_refund text, p_reason text, p_by uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; pay public.payments; amt bigint; total bigint := 0; n int := 0;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if t.status = 'refunded' then return jsonb_build_object('status', 'refunded', 'already', true); end if;
  if t.status <> 'paid' then raise exception 'only a paid ticket can be refunded'; end if;
  if public.refund_block(t.id) is not null then raise exception '%', public.refund_block(t.id); end if;
  for pay in select * from public.payments where ticket_id = t.id and status = 'paid' and method <> 'gift_card' order by at loop
    -- Part already refunded in the Stripe dashboard: record only what is left.
    amt := pay.amount_cents - coalesce(pay.refunded_cents, 0);
    insert into public.refunds (salon_id, ticket_id, payment_id, amount_cents, reason, stripe_refund_id, approved_by)
    values (t.salon_id, t.id, pay.id, amt, coalesce(p_reason, ''),
            case when pay.stripe_payment_intent is not null then p_stripe_refund end, public._salon_member(t.salon_id, p_by));
    update public.payments set status = 'refunded', refunded_cents = amount_cents where id = pay.id;
    total := total + amt; n := n + 1;
  end loop;
  if n = 0 then
    select * into pay from public.payments where ticket_id = t.id and status = 'paid' order by at desc limit 1;
    insert into public.refunds (salon_id, ticket_id, payment_id, amount_cents, reason, stripe_refund_id, approved_by)
    values (t.salon_id, t.id, pay.id, pay.amount_cents, coalesce(p_reason, ''), p_stripe_refund, public._salon_member(t.salon_id, p_by));
    total := pay.amount_cents;
  end if;
  update public.tickets set status = 'refunded', updated_at = now() where id = t.id;
  insert into public.audit_log (salon_id, action, detail) values (t.salon_id, 'ticket.refunded', jsonb_build_object('ticket', t.id, 'number', t.number, 'amount_cents', total));
  return jsonb_build_object('status', 'refunded', 'amount_cents', total);
end $$;

revoke execute on function public.cash_part(jsonb), public.cash_part_undo(uuid) from public, anon;
grant execute on function public.cash_part(jsonb), public.cash_part_undo(uuid) to authenticated;
