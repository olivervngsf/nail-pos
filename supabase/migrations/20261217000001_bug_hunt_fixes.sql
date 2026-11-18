-- Bug hunt fixes (Nov 18). Each block = one confirmed bug. Functions are re-made whole from their latest version.

-- 1. Card payment on a ticket with a loyalty reward never marked the ticket paid: the card step did not count the reward
--    as money off (save_ticket and pay_info did), so the charge looked like "ticket changed" and was flagged extra.
create or replace function public._card_due(p_ticket uuid) returns bigint language sql stable set search_path = '' as $$
  select (greatest(coalesce(sum(l.amount_cents) filter (where l.kind = 'service'), 0)
                   - least(coalesce(-sum(l.amount_cents) filter (where l.kind in ('discount', 'loyalty_reward')), 0), coalesce(sum(l.amount_cents) filter (where l.kind = 'service'), 0)), 0)
          + coalesce(sum(l.amount_cents) filter (where l.kind = 'gift_sale'), 0)
          - coalesce((select sum(p.amount_cents) from public.payments p where p.ticket_id = p_ticket and p.method = 'gift_card' and p.status = 'paid'), 0))::bigint
  from public.ticket_lines l where l.ticket_id = p_ticket and l.removed_at is null $$;

create or replace function public.settle_card(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pr public.pay_requests; t public.tickets; pid uuid; tp jsonb; sub bigint; disc bigint; tip bigint; gift bigint; why text;
begin
  select * into pr from public.pay_requests where id = (p->>'payRequestId')::uuid for update;
  if pr.id is null then raise exception 'no pay request'; end if;
  select * into t from public.tickets where id = pr.ticket_id for update;
  select id into pid from public.payments where stripe_payment_intent = p->>'paymentIntent';
  if pid is not null then
    return jsonb_build_object('ticket', t.id, 'status', t.status, 'already', true, 'payment', pid);
  end if;

  why := case when pr.status <> 'pending' then 'try was ' || pr.status
              when t.status <> 'open' then 'ticket already ' || t.status
              when public._card_due(t.id) <> pr.amount_cents then 'ticket changed' end;
  if why is not null then
    insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, fee_cents, stripe_payment_intent, card_brand, card_last4, status, taken_by, device_id, at)
    values (gen_random_uuid(), t.salon_id, t.id, pr.method, (p->>'amountCents')::bigint, coalesce((p->>'tipCents')::bigint, 0), coalesce((p->>'feeCents')::bigint, 0),
            p->>'paymentIntent', p->>'brand', p->>'last4', 'extra', pr.created_by, t.device_id, coalesce((p->>'at')::timestamptz, now()))
    returning id into pid;
    update public.pay_requests set payment_intent = coalesce(payment_intent, p->>'paymentIntent'),
      error = 'Card paid after this try stopped (' || why || '). Refund it.', updated_at = now() where id = pr.id;
    insert into public.audit_log (salon_id, action, detail)
    values (t.salon_id, 'payment.extra', jsonb_build_object('ticket', t.id, 'number', t.number, 'payment', pid, 'amount_cents', (p->>'amountCents')::bigint, 'why', why));
    return jsonb_build_object('ticket', t.id, 'status', t.status, 'extra', true, 'payment', pid);
  end if;

  -- Card tips replace any tip lines on the ticket (a stale save from before the card step can't double them).
  update public.ticket_lines set removed_at = now() where ticket_id = t.id and kind = 'tip' and removed_at is null;
  for tp in select * from jsonb_array_elements(coalesce(p->'tips', '[]')) loop
    continue when coalesce((tp->>'cents')::bigint, 0) <= 0;
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, staff_id, name, amount_cents, sort)
    values (gen_random_uuid(), t.salon_id, t.id, 'tip', public._salon_member(t.salon_id, (tp->>'staffId')::uuid), 'Card tip', (tp->>'cents')::bigint, 1000);
  end loop;
  select coalesce(sum(amount_cents) filter (where kind = 'service'), 0), coalesce(-sum(amount_cents) filter (where kind in ('discount', 'loyalty_reward')), 0),
         coalesce(sum(amount_cents) filter (where kind = 'tip'), 0), coalesce(sum(amount_cents) filter (where kind = 'gift_sale'), 0)
    into sub, disc, tip, gift from public.ticket_lines where ticket_id = t.id and removed_at is null;
  disc := least(disc, sub);
  insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, fee_cents, stripe_payment_intent, card_brand, card_last4, taken_by, device_id, at)
  values (gen_random_uuid(), t.salon_id, t.id, pr.method, (p->>'amountCents')::bigint, coalesce((p->>'tipCents')::bigint, 0), coalesce((p->>'feeCents')::bigint, 0),
          p->>'paymentIntent', p->>'brand', p->>'last4', pr.created_by, t.device_id, coalesce((p->>'at')::timestamptz, now()))
  returning id into pid;
  update public.tickets set status = 'paid', paid_at = coalesce((p->>'at')::timestamptz, now()), paid_by = pr.created_by,
    subtotal_cents = sub, discount_cents = disc, tip_cents = tip, gift_cents = gift, total_cents = sub - disc + tip + gift, updated_at = now() where id = t.id;
  update public.pay_requests set status = 'paid', tip_cents = coalesce((p->>'tipCents')::bigint, 0), payment_intent = p->>'paymentIntent', updated_at = now() where id = pr.id;
  update public.pay_requests set status = 'canceled', error = 'paid another way', updated_at = now() where ticket_id = t.id and id <> pr.id and status = 'pending';
  insert into public.audit_log (salon_id, action, detail)
  values (t.salon_id, 'ticket.paid', jsonb_build_object('ticket', t.id, 'number', t.number, 'total_cents', (p->>'amountCents')::bigint, 'method', pr.method));
  return jsonb_build_object('ticket', t.id, 'status', 'paid', 'payment', pid);
end $$;

-- 2. Refunds. (a) A ticket that sold a gift card can't be refunded in full once part of that card was spent
--    (the client would get all the money back and keep what they spent). (b) After a part refund made in Stripe,
--    record only what is left, not the whole payment again.
create or replace function public.refund_block(p_ticket uuid) returns text
language sql stable security definer set search_path = '' as $$
  select 'A gift card sold on this ticket was already used. Refund what is left on the card from Gift cards instead.'
  from public.ticket_lines l
  where l.ticket_id = p_ticket and l.kind = 'gift_sale' and l.removed_at is null and l.gift_card_id is not null
    and public._gift_balance(l.gift_card_id) < l.amount_cents limit 1;
$$;
revoke execute on function public.refund_block(uuid) from public, anon, authenticated;
grant execute on function public.refund_block(uuid) to service_role;
create or replace function public.settle_refund(p_ticket uuid, p_stripe_refund text, p_reason text, p_by uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; pay public.payments; amt bigint;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if t.status = 'refunded' then return jsonb_build_object('status', 'refunded', 'already', true); end if;
  if t.status <> 'paid' then raise exception 'only a paid ticket can be refunded'; end if;
  if public.refund_block(t.id) is not null then raise exception '%', public.refund_block(t.id); end if;
  select * into pay from public.payments where ticket_id = t.id and status = 'paid' order by (method = 'gift_card'), at desc limit 1;
  -- Part already refunded in the Stripe dashboard: record only what is left.
  amt := pay.amount_cents - case when pay.method = 'gift_card' then 0 else coalesce(pay.refunded_cents, 0) end;
  insert into public.refunds (salon_id, ticket_id, payment_id, amount_cents, reason, stripe_refund_id, approved_by)
  values (t.salon_id, t.id, pay.id, amt, coalesce(p_reason, ''), p_stripe_refund, public._salon_member(t.salon_id, p_by));
  if pay.method <> 'gift_card' then update public.payments set status = 'refunded', refunded_cents = amount_cents where id = pay.id; end if;
  update public.tickets set status = 'refunded', updated_at = now() where id = t.id;
  insert into public.audit_log (salon_id, action, detail) values (t.salon_id, 'ticket.refunded', jsonb_build_object('ticket', t.id, 'number', t.number, 'amount_cents', amt));
  return jsonb_build_object('status', 'refunded');
end $$;

-- 3. Cash on a ticket that gift cards already over-paid (a service was removed after the gift card was used) wrote a
--    cash payment below $0 with "change": a gift card turned into cash. Now refused.
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
    -- Gift cards already took more than the ticket is now worth: no cash "change" from a gift card. Put the service back or take the gift card off.
    if left_due < 0 then raise exception 'gift card covers more than this ticket: take the gift card off first'; end if;
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

-- 4. promo_send: the "already sent" answer was not tied to the salon (another salon's send could be read by its id).
create or replace function public.promo_send(p_salon uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := (p->>'id')::uuid; msg text := btrim(coalesce(p->>'message', '')); aud text := coalesce(p->>'audience', 'all');
  ppl int; parts int; bal bigint; r public.promo_sends;
begin
  if not public.is_admin(p_salon) then raise exception 'owner or manager only'; end if;
  select * into r from public.promo_sends where id = sid;
  if found and r.salon_id <> p_salon then raise exception 'not allowed'; end if;
  if found then
    return jsonb_build_object('people', r.people, 'parts', r.parts, 'texts', r.texts, 'cents', r.cents, 'balanceCents', public._text_credit_balance(p_salon));
  end if;
  if msg = '' then raise exception 'write a message first'; end if;
  if char_length(msg) > 480 then raise exception 'message is too long (480 letters max)'; end if;
  if aud not in ('all', 'lapsed') then raise exception 'pick who gets it'; end if;
  ppl := public._promo_people(p_salon, aud);
  if ppl = 0 then raise exception 'no clients to send to'; end if;
  parts := public._text_parts(msg);
  bal := public._text_credit_spend(p_salon, ppl * parts, left(msg, 40), public.my_person_id(), 'promo:' || sid::text);
  insert into public.promo_sends (id, salon_id, message, audience, people, parts, texts, cents, person_id)
  values (sid, p_salon, msg, aud, ppl, parts, ppl * parts, ppl * parts * 2, public.my_person_id());
  return jsonb_build_object('people', ppl, 'parts', parts, 'texts', ppl * parts, 'cents', ppl * parts * 2, 'balanceCents', bal);
end $$;

-- 5. Invites: an invite must point at a staff member of the same salon. Before, an owner/manager of one salon could make
--    an invite for another salon's staff id and join that salon with it.
create or replace function public.redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.invites; m public.memberships; pid uuid;
begin
  select * into i from public.invites where code = upper(replace(trim(p_code), '-', ''));
  if i.code is null then raise exception 'invite not found'; end if;
  select * into m from public.memberships where id = i.membership_id and archived_at is null;
  if m.id is null or m.salon_id <> i.salon_id then raise exception 'invite not found'; end if;
  if m.person_id is not null and m.person_id = public.my_person_id() then return m.salon_id; end if;
  if i.used_at is not null or m.person_id is not null then raise exception 'invite used'; end if;
  if i.expires_at < now() then raise exception 'invite expired'; end if;
  pid := public._person_for(m.phone, m.display_name);
  if exists (select 1 from public.memberships where salon_id = m.salon_id and person_id = pid and archived_at is null) then
    raise exception 'already in salon';
  end if;
  update public.memberships set person_id = pid, user_id = (select auth.uid()) where id = m.id;
  update public.invites set used_at = now() where code = i.code;
  insert into public.audit_log (salon_id, person_id, action, detail) values (m.salon_id, pid, 'invite.used', jsonb_build_object('role', m.role));
  return m.salon_id;
end $$;

create or replace function public._invite_same_salon() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.membership_id is not null and not exists (select 1 from public.memberships m where m.id = new.membership_id and m.salon_id = new.salon_id) then
    raise exception 'invite must be for a staff member of this salon';
  end if;
  return new;
end $$;
drop trigger if exists invite_same_salon on public.invites;
create trigger invite_same_salon before insert or update of membership_id, salon_id on public.invites
  for each row execute function public._invite_same_salon();
delete from public.invites i where i.membership_id is not null
  and not exists (select 1 from public.memberships m where m.id = i.membership_id and m.salon_id = i.salon_id);

-- 6. client_lookup (full phone + notes by phone) is a desk tool: techs no longer get it (tech privacy, Nov 18).
create or replace function public.client_lookup(p_salon uuid, p_phone text)
returns table (client_id uuid, name text, phone text, notes text, visits int, avg_cents bigint, last_visit timestamptz, last_services text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.phone, c.notes,
    (select count(*)::int from public.tickets t where t.client_id = c.id and t.status = 'paid'),
    (select coalesce(round(avg(t.subtotal_cents - t.discount_cents)), 0)::bigint from public.tickets t where t.client_id = c.id and t.status = 'paid'),
    lt.paid_at,
    (select string_agg(l.name || coalesce(' with ' || m.display_name, ''), ', ' order by l.sort)
       from public.ticket_lines l left join public.memberships m on m.id = l.staff_id
       where l.ticket_id = lt.id and l.kind = 'service' and l.removed_at is null)
  from public.clients c
  left join lateral (select t.id, t.paid_at from public.tickets t where t.client_id = c.id and t.status = 'paid' order by t.paid_at desc limit 1) lt on true
  where c.salon_id = p_salon and c.phone = p_phone and c.archived_at is null and public._is_desk(p_salon);
$$;

-- 7. A manager could set the owner's PIN (and then approve as the owner). Owner's PIN = owner only.
create or replace function public.admin_set_pin(p_membership uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (select salon_id from public.memberships where id = p_membership); len int;
begin
  if sid is null or not public.is_admin(sid) then raise exception 'not allowed'; end if;
  -- Only the owner sets the owner's PIN (a manager could otherwise approve things under the owner's name).
  if (select role from public.memberships where id = p_membership) = 'owner' and not public.is_owner(sid) then raise exception 'not allowed'; end if;
  len := (public._pin_rules(sid)->>'length')::int;
  if public._pin_bad(p_pin, len) then raise exception 'weak pin'; end if;
  update public.memberships set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_len = len, pin_fails = 0, pin_locked_until = null where id = p_membership;
  insert into public.audit_log (salon_id, person_id, action, detail) values (sid, public.my_person_id(), 'pin.reset', jsonb_build_object('membership', p_membership));
end $$;

-- 8. Clock in/out twice in a row (stale screen, phone + desk) wrote two events, so hours were lost or doubled.
--    The same kind twice is now ignored; the answer stays the same.
create or replace function public._last_clock(p_membership uuid) returns text language sql stable security definer set search_path = '' as $$
  select kind from public.clock_events where membership_id = p_membership order by at desc limit 1;
$$;
revoke execute on function public._last_clock(uuid) from public, anon, authenticated;
create or replace function public.pin_clock(p_device uuid, p_membership uuid, p_pin text, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if p_kind not in ('in', 'out') then raise exception 'bad kind'; end if;
  perform set_config('nailpos.pin_purpose', 'clock_' || p_kind, true);
  r := public._check_pin(p_device, p_membership, p_pin);
  if not (r->>'ok')::boolean then return r; end if;
  -- Already clocked in/out (a stale screen, a second tap, phone + desk): don't write the same thing twice.
  if p_kind is distinct from public._last_clock(p_membership) and not (p_kind = 'out' and public._last_clock(p_membership) is null) then
    insert into public.clock_events (salon_id, membership_id, kind, source, device_id) values ((r->>'salon_id')::uuid, p_membership, p_kind, 'pin', p_device);
  end if;
  return r || jsonb_build_object('kind', p_kind, 'at', now());
end $$;

create or replace function public.clock_self(p_salon uuid, p_kind text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  select id into mid from public.memberships where salon_id = p_salon and person_id = public.my_person_id() and archived_at is null;
  if mid is null then raise exception 'not a member'; end if;
  if p_kind not in ('in', 'out') then raise exception 'bad kind'; end if;
  perform 1 from public.memberships where id = mid for update;
  if p_kind is distinct from public._last_clock(mid) and not (p_kind = 'out' and public._last_clock(mid) is null) then
    insert into public.clock_events (salon_id, membership_id, kind, source, by_person) values (p_salon, mid, p_kind, 'phone', public.my_person_id());
  end if;
  return now();
end $$;
