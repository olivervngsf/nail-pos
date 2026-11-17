-- Session 3 (M4): card payments with Stripe Connect (each salon its own Express account, direct charges, salon pays fees).
-- Card reader (Stripe Terminal S710, server-driven) and pay link / QR (client pays on their phone). Refunds.
-- Stripe-confirmed writes happen only on the server (service role); the desk reads.

create table public.stripe_accounts (
  salon_id uuid primary key references public.salons(id),
  account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  location_id text,
  updated_at timestamptz not null default now()
);

create table public.card_readers (
  id text primary key,                                     -- Stripe reader id (tmr_…)
  salon_id uuid not null references public.salons(id),
  label text not null default 'Front desk',
  simulated boolean not null default false,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.pay_requests (
  id uuid primary key default gen_random_uuid(),           -- also the client's pay-link token
  salon_id uuid not null references public.salons(id),
  ticket_id uuid not null references public.tickets(id),
  method text not null check (method in ('card_reader', 'pay_link')),
  amount_cents bigint not null check (amount_cents > 0),   -- before tip
  tip_cents bigint,
  payment_intent text,
  checkout_session text,
  reader_id text references public.card_readers(id),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled')),
  error text,
  created_by uuid references public.memberships(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.pay_requests (ticket_id);

create table public.stripe_events (
  id text primary key,
  salon_id uuid references public.salons(id),
  ticket_id uuid references public.tickets(id),
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  ticket_id uuid not null references public.tickets(id),
  payment_id uuid not null references public.payments(id),
  amount_cents bigint not null check (amount_cents > 0),
  reason text not null default '',
  stripe_refund_id text unique,
  approved_by uuid references public.memberships(id),
  at timestamptz not null default now()
);

alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('cash', 'card_reader', 'pay_link'));
alter table public.payments add column stripe_payment_intent text unique,
  add column card_brand text, add column card_last4 text, add column refunded_cents bigint not null default 0;
alter table public.tickets drop constraint tickets_status_check;
alter table public.tickets add constraint tickets_status_check check (status in ('open', 'paid', 'refunded', 'voided'));

do $$ declare t text; begin
  foreach t in array array['stripe_accounts', 'card_readers', 'pay_requests', 'stripe_events', 'refunds'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
create policy "members read" on public.stripe_accounts for select to authenticated using (public.is_member(salon_id));
create policy "members read" on public.card_readers for select to authenticated using (public.is_member(salon_id));
create policy "members read" on public.pay_requests for select to authenticated using (public.is_member(salon_id));
create policy "admins read" on public.stripe_events for select to authenticated using (public.is_admin(salon_id));
create policy "members read" on public.refunds for select to authenticated using (public.is_member(salon_id));

-- What a desk may charge for this ticket (amount worked out here). Raises if not allowed.
create function public.pay_info(p_ticket uuid)
returns table (salon_id uuid, number int, status text, due_cents bigint, account_id text, charges_enabled boolean, salon_name text)
language plpgsql stable security definer set search_path = '' as $$
declare t public.tickets;
begin
  select * into t from public.tickets where id = p_ticket;
  if t.id is null or not public._is_desk(t.salon_id) then raise exception 'not allowed'; end if;
  return query select t.salon_id, t.number, t.status, t.subtotal_cents - t.discount_cents, a.account_id, coalesce(a.charges_enabled, false), s.name
    from public.salons s left join public.stripe_accounts a on a.salon_id = s.id where s.id = t.salon_id;
end $$;

-- Card paid (called by the server after Stripe confirms). Same payment intent twice = one payment.
-- p: {payRequestId, paymentIntent, amountCents, tipCents, feeCents, brand, last4, at, tips: [{staffId, cents}]}
create function public.settle_card(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pr public.pay_requests; t public.tickets; pid uuid; tp jsonb; sub bigint; disc bigint; tip bigint;
begin
  select * into pr from public.pay_requests where id = (p->>'payRequestId')::uuid for update;
  if pr.id is null then raise exception 'no pay request'; end if;
  select * into t from public.tickets where id = pr.ticket_id for update;
  if exists (select 1 from public.payments where stripe_payment_intent = p->>'paymentIntent') or t.status <> 'open' then
    update public.pay_requests set status = 'paid', updated_at = now() where id = pr.id and status = 'pending';
    return jsonb_build_object('ticket', t.id, 'status', t.status, 'already', true);
  end if;
  for tp in select * from jsonb_array_elements(coalesce(p->'tips', '[]')) loop
    continue when coalesce((tp->>'cents')::bigint, 0) <= 0;
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, staff_id, name, amount_cents, sort)
    values (gen_random_uuid(), t.salon_id, t.id, 'tip', public._salon_member(t.salon_id, (tp->>'staffId')::uuid), 'Card tip', (tp->>'cents')::bigint, 1000);
  end loop;
  select coalesce(sum(amount_cents) filter (where kind = 'service'), 0), coalesce(-sum(amount_cents) filter (where kind = 'discount'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'tip'), 0)
    into sub, disc, tip from public.ticket_lines where ticket_id = t.id and removed_at is null;
  disc := least(disc, sub);
  insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, fee_cents, stripe_payment_intent, card_brand, card_last4, taken_by, device_id, at)
  values (gen_random_uuid(), t.salon_id, t.id, pr.method, (p->>'amountCents')::bigint, coalesce((p->>'tipCents')::bigint, 0), coalesce((p->>'feeCents')::bigint, 0),
          p->>'paymentIntent', p->>'brand', p->>'last4', pr.created_by, t.device_id, coalesce((p->>'at')::timestamptz, now()))
  returning id into pid;
  update public.tickets set status = 'paid', paid_at = coalesce((p->>'at')::timestamptz, now()), paid_by = pr.created_by,
    subtotal_cents = sub, discount_cents = disc, tip_cents = tip, total_cents = sub - disc + tip, updated_at = now() where id = t.id;
  update public.pay_requests set status = 'paid', tip_cents = coalesce((p->>'tipCents')::bigint, 0), payment_intent = p->>'paymentIntent', updated_at = now() where id = pr.id;
  update public.pay_requests set status = 'canceled', updated_at = now() where ticket_id = t.id and id <> pr.id and status = 'pending';
  insert into public.audit_log (salon_id, action, detail)
  values (t.salon_id, 'ticket.paid', jsonb_build_object('ticket', t.id, 'number', t.number, 'total_cents', (p->>'amountCents')::bigint, 'method', pr.method));
  return jsonb_build_object('ticket', t.id, 'status', 'paid', 'payment', pid);
end $$;

-- Refund (whole ticket). Server only, after Stripe refunds a card (cash: nothing to send).
create function public.settle_refund(p_ticket uuid, p_stripe_refund text, p_reason text, p_by uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; pay public.payments;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if t.status = 'refunded' then return jsonb_build_object('status', 'refunded', 'already', true); end if;
  if t.status <> 'paid' then raise exception 'only a paid ticket can be refunded'; end if;
  select * into pay from public.payments where ticket_id = t.id and status = 'paid' order by at desc limit 1;
  insert into public.refunds (salon_id, ticket_id, payment_id, amount_cents, reason, stripe_refund_id, approved_by)
  values (t.salon_id, t.id, pay.id, pay.amount_cents, coalesce(p_reason, ''), p_stripe_refund, public._salon_member(t.salon_id, p_by));
  update public.payments set status = 'refunded', refunded_cents = amount_cents where id = pay.id;
  update public.tickets set status = 'refunded', updated_at = now() where id = t.id;
  insert into public.audit_log (salon_id, action, detail) values (t.salon_id, 'ticket.refunded', jsonb_build_object('ticket', t.id, 'number', t.number, 'amount_cents', pay.amount_cents));
  return jsonb_build_object('status', 'refunded');
end $$;

-- Checkout's payment set-up for a salon: Stripe ready? which readers?
create function public.salon_pay_setup(p_salon uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.is_member(p_salon) then jsonb_build_object(
    'charges_enabled', coalesce((select charges_enabled from public.stripe_accounts where salon_id = p_salon), false),
    'readers', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'label', r.label, 'simulated', r.simulated) order by r.created_at)
                         from public.card_readers r where r.salon_id = p_salon and r.archived_at is null), '[]'::jsonb)) end;
$$;

revoke execute on function public.settle_card(jsonb), public.settle_refund(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.settle_card(jsonb), public.settle_refund(uuid, text, text, uuid) to service_role;
revoke execute on function public.pay_info(uuid), public.salon_pay_setup(uuid) from public, anon;
grant execute on function public.pay_info(uuid), public.salon_pay_setup(uuid) to authenticated;
