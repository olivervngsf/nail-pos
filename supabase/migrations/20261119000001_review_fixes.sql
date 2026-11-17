-- Review fixes (Nov 17 code review). Each block says what it stops.
--  1. PIN hashes + fail counts can't be read through the API; direct team edits can't touch owner rows or PIN columns.
--  2. A person can't change their own phone; signing in never takes over someone else's account.
--  3. PIN checks: only from the salon device's session (owner/manager), and parallel guesses can't skip the 5-tries lock.
--  4. Manager OKs are tied to one job: a discount OK to one ticket, a refund OK to one ticket and used once. Only managers read them.
--  5. Card payments: a ticket that changes while a card try waits cancels that try; a card payment that lands on a
--     cancelled try / changed or already-paid ticket is still recorded (status 'extra', flagged to refund), never lost.
--  6. Techs don't read clients, tickets, ticket lines, payments, receipts, pay requests or refunds (desk roles only).

-- ---------- 1. memberships ----------
revoke select, insert, update, delete on public.memberships from anon, authenticated;
grant select (id, salon_id, user_id, person_id, display_name, phone, role, pay_type, commission_pct, hourly_cents, language,
  license_no, license_state, license_expires, created_at, archived_at) on public.memberships to authenticated;
grant insert (salon_id, display_name, phone, role, pay_type, commission_pct, hourly_cents, language,
  license_no, license_state, license_expires) on public.memberships to authenticated;
grant update (display_name, phone, role, pay_type, commission_pct, hourly_cents, language,
  license_no, license_state, license_expires, archived_at) on public.memberships to authenticated;

drop policy "admins add team" on public.memberships;
drop policy "admins edit team" on public.memberships;
create policy "admins add team" on public.memberships for insert to authenticated
  with check (public.is_admin(salon_id) and role <> 'owner');
create policy "admins edit team" on public.memberships for update to authenticated
  using (public.is_admin(salon_id) and role <> 'owner') with check (public.is_admin(salon_id) and role <> 'owner');

-- ---------- 2. people: phone is set from the verified sign-in only ----------
revoke update on public.people from anon, authenticated;
grant update (name, email, language, photo_url) on public.people to authenticated;

create or replace function public._ensure_person(p_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); ph text := public._auth_phone(); pid uuid; holder uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select id into pid from public.people where auth_user_id = uid;
  if pid is not null then
    if p_name is not null and p_name <> '' then update public.people set name = p_name where id = pid and name = ''; end if;
    return pid;
  end if;
  if ph is null then raise exception 'sign in with a phone number'; end if;
  insert into public.people (auth_user_id, phone, name) values (uid, ph, coalesce(nullif(p_name, ''), ''))
  on conflict (phone) do update set auth_user_id = coalesce(public.people.auth_user_id, excluded.auth_user_id)
  returning id, auth_user_id into pid, holder;
  if holder is distinct from uid then raise exception 'this phone number belongs to another account'; end if;
  return pid;
end $$;

-- New salon: the owner's people row comes from their verified phone, not from what the device sends.
create or replace function public.create_salon(p_name text, p_state text, p_owner_name text, p_owner_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; pid uuid := public._ensure_person(p_owner_name);
begin
  insert into public.salons (name, state) values (p_name, coalesce(p_state, 'CA')) returning id into sid;
  insert into public.memberships (salon_id, user_id, person_id, display_name, phone, role)
    values (sid, (select auth.uid()), pid, p_owner_name, (select phone from public.people where id = pid), 'owner');
  insert into public.audit_log (salon_id, person_id, action) values (sid, pid, 'salon.created');
  return sid;
end $$;

-- ---------- 3. PIN check ----------
create or replace function public._check_pin(p_device uuid, p_membership uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.devices; m public.memberships;
begin
  select * into d from public.devices where id = p_device and archived_at is null;
  -- A salon device is signed in by an owner/manager (register_device). Staff on their own phones can't try PINs.
  if d.id is null or not public.is_member(d.salon_id)
     or not (public.is_admin(d.salon_id) or d.signed_in_by = public.my_person_id()) then
    return jsonb_build_object('ok', false, 'reason', 'device');
  end if;
  -- Row lock: parallel guesses wait for each other, so every wrong try counts.
  select * into m from public.memberships where id = p_membership and salon_id = d.salon_id and archived_at is null for update;
  if m.id is null then return jsonb_build_object('ok', false, 'reason', 'person'); end if;
  if m.pin_locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'until', m.pin_locked_until); end if;
  if m.pin_hash is null then return jsonb_build_object('ok', false, 'reason', 'no_pin'); end if;
  if extensions.crypt(p_pin, m.pin_hash) = m.pin_hash then
    update public.memberships set pin_fails = 0 where id = m.id;
    update public.devices set last_seen = now() where id = d.id;
    return jsonb_build_object('ok', true, 'membership_id', m.id, 'name', m.display_name, 'role', m.role, 'salon_id', d.salon_id);
  end if;
  if m.pin_fails + 1 >= 5 then
    update public.memberships set pin_fails = 0, pin_locked_until = now() + interval '5 minutes' where id = m.id;
    insert into public.audit_log (salon_id, device_id, action, detail) values (d.salon_id, d.id, 'pin.locked', jsonb_build_object('membership', m.id));
    return jsonb_build_object('ok', false, 'reason', 'locked', 'until', now() + interval '5 minutes');
  end if;
  update public.memberships set pin_fails = pin_fails + 1 where id = m.id;
  return jsonb_build_object('ok', false, 'reason', 'wrong', 'tries_left', 4 - m.pin_fails);
end $$;
revoke execute on function public._check_pin(uuid, uuid, text) from public, anon, authenticated;

-- ---------- 4. manager OKs ----------
alter table public.discount_approvals
  add column purpose text not null default 'discount' check (purpose in ('discount', 'refund')),
  add column ticket_id uuid references public.tickets(id),
  add column used_at timestamptz;
drop policy "members read" on public.discount_approvals;
create policy "admins read" on public.discount_approvals for select to authenticated using (public.is_admin(salon_id));

drop function public.approve_discount(uuid, uuid, uuid, text);
create function public.approve_discount(p_salon uuid, p_device uuid default null, p_membership uuid default null, p_pin text default null,
  p_purpose text default 'discount', p_ticket uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; mid uuid; aid uuid;
begin
  if p_purpose not in ('discount', 'refund') then raise exception 'bad purpose'; end if;
  if p_purpose = 'refund' and not exists (select 1 from public.tickets where id = p_ticket and salon_id = p_salon) then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;
  if p_device is null then
    if not public.is_admin(p_salon) then return jsonb_build_object('ok', false, 'reason', 'not_manager'); end if;
    select m.id into mid from public.memberships m where m.salon_id = p_salon and m.person_id = public.my_person_id() and m.archived_at is null;
    r := jsonb_build_object('ok', true, 'membership_id', mid, 'name', (select display_name from public.memberships where id = mid));
  else
    r := public._check_pin(p_device, p_membership, p_pin);
    if not (r->>'ok')::boolean then return r; end if;
    if (r->>'salon_id')::uuid <> p_salon then return jsonb_build_object('ok', false, 'reason', 'device'); end if;
    if r->>'role' not in ('owner', 'manager') then return jsonb_build_object('ok', false, 'reason', 'not_manager'); end if;
    mid := p_membership;
  end if;
  insert into public.discount_approvals (salon_id, membership_id, device_id, purpose, ticket_id)
    values (p_salon, mid, p_device, p_purpose, case when p_purpose = 'refund' then p_ticket end) returning id into aid;
  return r || jsonb_build_object('approval_id', aid);
end $$;
revoke execute on function public.approve_discount(uuid, uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.approve_discount(uuid, uuid, uuid, text, text, uuid) to authenticated;

-- Refund OK: used once, for that ticket, within 15 minutes. Returns the approver's membership (null = no OK). Server only.
create function public.use_refund_ok(p_approval uuid, p_ticket uuid) returns uuid
language sql security definer set search_path = '' as $$
  update public.discount_approvals set used_at = now()
  where id = p_approval and ticket_id = p_ticket and purpose = 'refund' and used_at is null and at > now() - interval '15 minutes'
  returning membership_id;
$$;
revoke execute on function public.use_refund_ok(uuid, uuid) from public, anon, authenticated;
grant execute on function public.use_refund_ok(uuid, uuid) to service_role;

-- ---------- 5. tickets + card payments ----------
alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check check (status in ('paid', 'refunded', 'extra'));
comment on column public.payments.status is 'extra = card money that came in for a cancelled try or a changed/paid ticket: refund it to the client';

-- Same as before, plus: a discount OK binds to this ticket on first use (no reuse on other tickets), and a change to
-- what's owed cancels any card try still waiting. A cash payment cancels waiting card tries too.
create or replace function public.save_ticket(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid := (p->>'id')::uuid;
  sid uuid := (p->>'salonId')::uuid;
  t public.tickets;
  cid uuid;
  ln jsonb; i int := 0; keep uuid[] := '{}';
  sub bigint; disc bigint; tip bigint; total bigint; given bigint;
begin
  if tid is null or sid is null then raise exception 'ticket id and salon required'; end if;
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;

  select * into t from public.tickets where id = tid for update;
  if t.id is not null and t.salon_id <> sid then raise exception 'not allowed'; end if;
  if t.id is not null and t.status <> 'open' then
    return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status);
  end if;

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
    if ln->>'kind' not in ('service', 'discount', 'tip') then raise exception 'bad line'; end if;
    if ln->>'kind' = 'discount' then
      -- First use binds the OK to this ticket; later saves of the same ticket keep working (even after a long offline stretch).
      update public.discount_approvals set ticket_id = tid, used_at = coalesce(used_at, now())
      where id = (ln->>'approvalId')::uuid and salon_id = sid and purpose = 'discount'
        and (ticket_id = tid or (ticket_id is null and at > now() - interval '12 hours'));
      if not found then raise exception 'discount needs a manager PIN'; end if;
      if (ln->>'cents')::bigint > 0 then raise exception 'discount must take money off'; end if;
    elsif (ln->>'cents')::bigint < 0 then raise exception 'amount can''t be below $0';
    end if;
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, service_id, staff_id, name, minutes, amount_cents, price_from, reason, approval_id, sort)
    values ((ln->>'id')::uuid, sid, tid, ln->>'kind',
            (select id from public.services where id = (ln->>'serviceId')::uuid and salon_id = sid),
            public._salon_member(sid, (ln->>'staffId')::uuid),
            coalesce(ln->>'name', ''), (ln->>'minutes')::int, (ln->>'cents')::bigint, coalesce((ln->>'priceFrom')::boolean, false),
            ln->>'reason', (ln->>'approvalId')::uuid, i)
    on conflict (id) do update set kind = excluded.kind, service_id = excluded.service_id, staff_id = excluded.staff_id, name = excluded.name,
      minutes = excluded.minutes, amount_cents = excluded.amount_cents, price_from = excluded.price_from, reason = excluded.reason,
      approval_id = excluded.approval_id, sort = excluded.sort, removed_at = null
    where public.ticket_lines.ticket_id = tid;
    keep := keep || (ln->>'id')::uuid;
  end loop;
  update public.ticket_lines set removed_at = now() where ticket_id = tid and removed_at is null and not (id = any (keep));

  select coalesce(sum(amount_cents) filter (where kind = 'service'), 0),
         coalesce(-sum(amount_cents) filter (where kind = 'discount'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'tip'), 0)
    into sub, disc, tip from public.ticket_lines where ticket_id = tid and removed_at is null;
  disc := least(disc, sub);
  total := sub - disc + tip;
  update public.tickets set subtotal_cents = sub, discount_cents = disc, tip_cents = tip, total_cents = total where id = tid;

  -- What's owed changed while a card try waits: that try is no longer for this ticket.
  update public.pay_requests set status = 'canceled', error = 'ticket changed', updated_at = now()
  where ticket_id = tid and status = 'pending' and amount_cents <> sub - disc;

  if p ? 'payment' and p->'payment' is not null and jsonb_typeof(p->'payment') = 'object' then
    if p->'payment'->>'method' <> 'cash' then raise exception 'only cash for now'; end if;
    if exists (select 1 from public.ticket_lines where ticket_id = tid and removed_at is null and kind = 'service' and staff_id is null) then
      raise exception 'every service needs a staff member';
    end if;
    given := (p->'payment'->>'givenCents')::bigint;
    if given is null or given < total then raise exception 'cash given is less than the total'; end if;
    insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, given_cents, change_cents, taken_by, device_id, at)
    values ((p->'payment'->>'id')::uuid, sid, tid, 'cash', total, tip, given, given - total,
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

  return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status);
end $$;

-- Card money confirmed by Stripe (server only). Same payment intent twice = one payment.
-- Normal case: the try is still waiting and the ticket still owes exactly what was charged → ticket paid, card tips added.
-- Anything else (try cancelled, ticket changed or already paid): the money is recorded as 'extra' so it's never lost,
-- the ticket is left alone, and the audit log flags it for a refund.
create or replace function public.settle_card(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pr public.pay_requests; t public.tickets; pid uuid; tp jsonb; sub bigint; disc bigint; tip bigint; why text;
begin
  select * into pr from public.pay_requests where id = (p->>'payRequestId')::uuid for update;
  if pr.id is null then raise exception 'no pay request'; end if;
  select * into t from public.tickets where id = pr.ticket_id for update;
  select id into pid from public.payments where stripe_payment_intent = p->>'paymentIntent';
  if pid is not null then
    return jsonb_build_object('ticket', t.id, 'status', t.status, 'already', true, 'payment', pid);
  end if;

  select coalesce(sum(amount_cents) filter (where kind = 'service'), 0), coalesce(-sum(amount_cents) filter (where kind = 'discount'), 0)
    into sub, disc from public.ticket_lines where ticket_id = t.id and removed_at is null;
  disc := least(disc, sub);
  why := case when pr.status <> 'pending' then 'try was ' || pr.status
              when t.status <> 'open' then 'ticket already ' || t.status
              when sub - disc <> pr.amount_cents then 'ticket changed' end;

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

  -- Card tips replace any tip lines on the ticket (cash tips only exist on cash tickets).
  update public.ticket_lines set removed_at = now() where ticket_id = t.id and kind = 'tip' and removed_at is null;
  for tp in select * from jsonb_array_elements(coalesce(p->'tips', '[]')) loop
    continue when coalesce((tp->>'cents')::bigint, 0) <= 0;
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, staff_id, name, amount_cents, sort)
    values (gen_random_uuid(), t.salon_id, t.id, 'tip', public._salon_member(t.salon_id, (tp->>'staffId')::uuid), 'Card tip', (tp->>'cents')::bigint, 1000);
  end loop;
  select coalesce(sum(amount_cents), 0) into tip from public.ticket_lines where ticket_id = t.id and kind = 'tip' and removed_at is null;

  insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, fee_cents, stripe_payment_intent, card_brand, card_last4, taken_by, device_id, at)
  values (gen_random_uuid(), t.salon_id, t.id, pr.method, (p->>'amountCents')::bigint, coalesce((p->>'tipCents')::bigint, 0), coalesce((p->>'feeCents')::bigint, 0),
          p->>'paymentIntent', p->>'brand', p->>'last4', pr.created_by, t.device_id, coalesce((p->>'at')::timestamptz, now()))
  returning id into pid;
  update public.tickets set status = 'paid', paid_at = coalesce((p->>'at')::timestamptz, now()), paid_by = pr.created_by,
    subtotal_cents = sub, discount_cents = disc, tip_cents = tip, total_cents = sub - disc + tip, updated_at = now() where id = t.id;
  update public.pay_requests set status = 'paid', tip_cents = coalesce((p->>'tipCents')::bigint, 0), payment_intent = p->>'paymentIntent', updated_at = now() where id = pr.id;
  update public.pay_requests set status = 'canceled', error = 'paid another way', updated_at = now() where ticket_id = t.id and id <> pr.id and status = 'pending';
  insert into public.audit_log (salon_id, action, detail)
  values (t.salon_id, 'ticket.paid', jsonb_build_object('ticket', t.id, 'number', t.number, 'total_cents', (p->>'amountCents')::bigint, 'method', pr.method));
  return jsonb_build_object('ticket', t.id, 'status', 'paid', 'payment', pid);
end $$;

-- ---------- 6. desk roles read money + client data ----------
grant execute on function public._is_desk(uuid) to authenticated;  -- used by the policies below (says only whether *you* are desk staff)
do $$ declare t text; begin
  foreach t in array array['clients', 'tickets', 'ticket_lines', 'payments', 'receipts', 'pay_requests', 'refunds'] loop
    execute format('drop policy "members read" on public.%I', t);
    execute format('create policy "desk read" on public.%I for select to authenticated using (public._is_desk(salon_id))', t);
  end loop;
end $$;

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

-- ---------- 7. AI calls log (menu reading): per-person daily limit, written by the server only ----------
create table public.ai_calls (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null,
  kind text not null,
  at timestamptz not null default now()
);
create index on public.ai_calls (auth_user_id, at desc);
alter table public.ai_calls enable row level security;  -- no policies: only the server (secret key) reads or writes
revoke all on public.ai_calls from anon, authenticated;
