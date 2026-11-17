-- M10: Close day (Main Screens · CloseDay Z1–Z5) + tech payout sheet + earnings by PIN.
-- Rules: money in cents; days are the salon's own calendar day (salons.time_zone); salon keeps no tips;
-- card fee on tips only when the salon may pass it on (never CA/MN, locked by salons check); nothing deleted.

-- ---------- settings ----------
alter table public.salons add column drawer_start_cents bigint not null default 15000 check (drawer_start_cents >= 0);
-- Part of each tech's pay given by check (rest in cash). Owner sets it per person on the payout sheet.
alter table public.memberships add column check_pct smallint not null default 100 check (check_pct between 0 and 100);
grant select (check_pct) on public.memberships to authenticated;
grant update (check_pct) on public.memberships to authenticated;

-- A manager OK can also close the day (PIN on the salon device).
alter table public.discount_approvals drop constraint discount_approvals_purpose_check;
alter table public.discount_approvals add constraint discount_approvals_purpose_check check (purpose in ('discount', 'refund', 'close'));
create or replace function public.approve_discount(p_salon uuid, p_device uuid default null, p_membership uuid default null, p_pin text default null,
  p_purpose text default 'discount', p_ticket uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; mid uuid; aid uuid;
begin
  if p_purpose not in ('discount', 'refund', 'close') then raise exception 'bad purpose'; end if;
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

-- ---------- the closed day ----------
create table public.day_closes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  day date not null,
  start_cents bigint not null,                    -- cash in the drawer at opening
  cash_expected_cents bigint not null,
  cash_counted_cents bigint not null,
  counts jsonb not null default '{}',             -- bills/coins counted: {"100":2,"50":1,...,"coins":125}
  diff_reason text not null default '',
  cash_removed_cents bigint not null default 0 check (cash_removed_cents >= 0),  -- taken out (bank/safe); the rest starts tomorrow
  card_recorded_cents bigint not null default 0,
  card_stripe_cents bigint,                       -- null = not checked with Stripe
  left_open jsonb not null default '[]',          -- [{ticket, number, reason}]
  summary jsonb not null,                         -- the day as it stood when closed
  closed_by uuid references public.memberships(id),
  closed_at timestamptz not null default now(),
  unique (salon_id, day)
);
alter table public.day_closes enable row level security;
create policy "desk read" on public.day_closes for select to authenticated using (public._is_desk(salon_id));

-- Start and end of a salon's day.
create function public._day_lo(p_salon uuid, p_day date) returns timestamptz language sql stable set search_path = '' as $$
  select (p_day::timestamp at time zone s.time_zone) from public.salons s where s.id = p_salon $$;

-- Cash in the drawer at opening: what the last close left in it, else the salon's starting cash.
create function public._drawer_start(p_salon uuid, p_day date) returns bigint language sql stable set search_path = '' as $$
  select coalesce((select c.cash_counted_cents - c.cash_removed_cents from public.day_closes c
                   where c.salon_id = p_salon and c.day < p_day order by c.day desc limit 1),
                  (select drawer_start_cents from public.salons where id = p_salon)) $$;

-- Tips per staff on tickets paid in [lo, hi) and not refunded: card vs cash, card fee on tips (only if the salon may pass it on).
create function public._tips(p_salon uuid, lo timestamptz, hi timestamptz)
returns table (membership_id uuid, card_cents bigint, cash_cents bigint, fee_cents bigint)
language sql stable set search_path = '' as $$
  with l as (
    select l.staff_id, l.amount_cents, (l.name = 'Card tip') as card,
      case when l.name = 'Card tip' and s.tip_fee_passthrough then
        coalesce((select round(p.fee_cents::numeric * l.amount_cents / nullif(p.amount_cents, 0))::bigint from public.payments p
                  where p.ticket_id = t.id and p.method in ('card_reader', 'pay_link') and p.status = 'paid' order by p.at desc limit 1), 0)
      else 0 end as fee
    from public.ticket_lines l join public.tickets t on t.id = l.ticket_id join public.salons s on s.id = t.salon_id
    where t.salon_id = p_salon and t.status = 'paid' and t.paid_at >= lo and t.paid_at < hi
      and l.kind = 'tip' and l.removed_at is null and l.staff_id is not null
  )
  select staff_id, coalesce(sum(amount_cents) filter (where card), 0)::bigint, coalesce(sum(amount_cents) filter (where not card), 0)::bigint,
    coalesce(sum(fee), 0)::bigint
  from l group by staff_id $$;

-- Everything Close day shows, worked out on the server. Desk roles only.
create function public.day_summary(p_salon uuid, p_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare lo timestamptz; hi timestamptz; r jsonb; start bigint; cash_in bigint; cash_out bigint; card_in bigint;
begin
  if not public._is_desk(p_salon) then raise exception 'not allowed'; end if;
  lo := public._day_lo(p_salon, p_day); hi := public._day_lo(p_salon, p_day + 1);
  start := public._drawer_start(p_salon, p_day);
  select coalesce(sum(amount_cents), 0) into cash_in from public.payments
    where salon_id = p_salon and method = 'cash' and status in ('paid', 'refunded') and at >= lo and at < hi;
  select coalesce(sum(r.amount_cents), 0) into cash_out from public.refunds r join public.payments p on p.id = r.payment_id
    where r.salon_id = p_salon and p.method = 'cash' and r.at >= lo and r.at < hi;
  select coalesce(sum(amount_cents), 0) into card_in from public.payments
    where salon_id = p_salon and method in ('card_reader', 'pay_link') and status in ('paid', 'refunded') and at >= lo and at < hi;

  select jsonb_build_object(
    'day', p_day,
    'open', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'client', c.name, 'total_cents', t.total_cents,
        'created_at', t.created_at,
        'staff', (select string_agg(distinct m.display_name, ', ') from public.ticket_lines l join public.memberships m on m.id = l.staff_id
                  where l.ticket_id = t.id and l.removed_at is null and l.kind = 'service'),
        'services', (select string_agg(l.name, ' + ' order by l.sort) from public.ticket_lines l where l.ticket_id = t.id and l.removed_at is null and l.kind = 'service'))
        order by t.number)
      from public.tickets t left join public.clients c on c.id = t.client_id
      where t.salon_id = p_salon and t.status = 'open' and t.created_at < hi
        and exists (select 1 from public.ticket_lines l where l.ticket_id = t.id and l.removed_at is null)), '[]'),
    'sales', (select jsonb_build_object('tickets', count(*), 'services_cents', coalesce(sum(subtotal_cents), 0), 'discount_cents', coalesce(sum(discount_cents), 0),
        'gift_sold_cents', coalesce(sum(gift_cents), 0), 'tips_cents', coalesce(sum(tip_cents), 0), 'total_cents', coalesce(sum(total_cents), 0))
      from public.tickets where salon_id = p_salon and status in ('paid', 'refunded') and paid_at >= lo and paid_at < hi),
    'paid', (select jsonb_build_object(
        'card_count', count(*) filter (where method in ('card_reader', 'pay_link') and status in ('paid', 'refunded')),
        'card_cents', coalesce(sum(amount_cents) filter (where method in ('card_reader', 'pay_link') and status in ('paid', 'refunded')), 0),
        'cash_count', count(*) filter (where method = 'cash' and status in ('paid', 'refunded')),
        'cash_cents', coalesce(sum(amount_cents) filter (where method = 'cash' and status in ('paid', 'refunded')), 0),
        'gift_cents', coalesce(sum(amount_cents) filter (where method = 'gift_card' and status in ('paid', 'refunded')), 0),
        'fee_cents', coalesce(sum(fee_cents) filter (where method in ('card_reader', 'pay_link')), 0),
        'extra_count', count(*) filter (where status = 'extra'),
        'extra_cents', coalesce(sum(amount_cents - refunded_cents) filter (where status = 'extra'), 0))
      from public.payments where salon_id = p_salon and at >= lo and at < hi),
    'refunds', (select jsonb_build_object('count', count(*), 'cents', coalesce(sum(r.amount_cents), 0),
        'cash_cents', coalesce(sum(r.amount_cents) filter (where p.method = 'cash'), 0),
        'card_cents', coalesce(sum(r.amount_cents) filter (where p.method in ('card_reader', 'pay_link')), 0))
      from public.refunds r join public.payments p on p.id = r.payment_id where r.salon_id = p_salon and r.at >= lo and r.at < hi),
    'cash', jsonb_build_object('start_cents', start, 'taken_cents', cash_in, 'refunded_cents', cash_out, 'expected_cents', start + cash_in - cash_out),
    'card_cents', card_in,
    'tips', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name, 'card_cents', x.card_cents, 'cash_cents', x.cash_cents,
        'fee_cents', x.fee_cents, 'total_cents', x.card_cents + x.cash_cents - x.fee_cents) order by m.display_name)
      from public._tips(p_salon, lo, hi) x join public.memberships m on m.id = x.membership_id), '[]'),
    'closed', (select to_jsonb(c) - 'summary' from public.day_closes c where c.salon_id = p_salon and c.day = p_day)
  ) into r;
  -- Zero surprises: what the tickets say was due must equal what came in (card + cash + gift card).
  return r || jsonb_build_object('unmatched_cents',
    (r->'sales'->>'total_cents')::bigint
    - ((select coalesce(sum(p.amount_cents), 0) from public.payments p join public.tickets t on t.id = p.ticket_id
        where t.salon_id = p_salon and t.status in ('paid', 'refunded') and t.paid_at >= lo and t.paid_at < hi
          and p.status in ('paid', 'refunded'))));
end $$;

-- Close the day. p: {salonId, day, counts, coinsCents, diffReason, cashRemovedCents, cardStripeCents?, leftOpen:[{id, reason}], approvalId?}
-- Front desk can fill it in; finishing needs an owner/manager (their own login, or a manager PIN OK for 'close').
create function public.close_day(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := (p->>'salonId')::uuid; d date := (p->>'day')::date; s jsonb; counted bigint := 0; k text; v jsonb;
  by_m uuid; open_ids uuid[]; left_ids uuid[]; row public.day_closes;
begin
  if sid is null or d is null then raise exception 'salon and day required'; end if;
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;
  if public.is_admin(sid) then
    select m.id into by_m from public.memberships m where m.salon_id = sid and m.person_id = public.my_person_id() and m.archived_at is null;
  else
    update public.discount_approvals set used_at = now()
    where id = (p->>'approvalId')::uuid and salon_id = sid and purpose = 'close' and used_at is null and at > now() - interval '15 minutes'
    returning membership_id into by_m;
    if by_m is null then raise exception 'closing the day needs an owner or manager OK'; end if;
  end if;

  s := public.day_summary(sid, d);
  select array_agg((x->>'id')::uuid) into open_ids from jsonb_array_elements(s->'open') x;
  select array_agg((x->>'id')::uuid) into left_ids from jsonb_array_elements(coalesce(p->'leftOpen', '[]')) x where coalesce(x->>'reason', '') <> '';
  if exists (select 1 from unnest(coalesce(open_ids, '{}')) o where not (o = any (coalesce(left_ids, '{}')))) then
    raise exception 'tickets still open: take payment or leave open with a reason';
  end if;

  for k, v in select * from jsonb_each(coalesce(p->'counts', '{}')) loop
    if k !~ '^(100|50|20|10|5|2|1)$' or (v #>> '{}')::int < 0 then raise exception 'bad count'; end if;
    counted := counted + k::int * 100 * (v #>> '{}')::int;
  end loop;
  counted := counted + greatest(coalesce((p->>'coinsCents')::bigint, 0), 0);

  insert into public.day_closes (salon_id, day, start_cents, cash_expected_cents, cash_counted_cents, counts, diff_reason, cash_removed_cents,
    card_recorded_cents, card_stripe_cents, left_open, summary, closed_by)
  values (sid, d, (s->'cash'->>'start_cents')::bigint, (s->'cash'->>'expected_cents')::bigint, counted,
    coalesce(p->'counts', '{}') || jsonb_build_object('coins', greatest(coalesce((p->>'coinsCents')::bigint, 0), 0)),
    coalesce(p->>'diffReason', ''), least(greatest(coalesce((p->>'cashRemovedCents')::bigint, 0), 0), counted),
    (s->>'card_cents')::bigint, (p->>'cardStripeCents')::bigint,
    coalesce((select jsonb_agg(jsonb_build_object('id', o->>'id', 'number', o->'number', 'reason',
        (select x->>'reason' from jsonb_array_elements(p->'leftOpen') x where x->>'id' = o->>'id' limit 1)))
      from jsonb_array_elements(s->'open') o), '[]'),
    s, by_m)
  on conflict (salon_id, day) do update set cash_expected_cents = excluded.cash_expected_cents, cash_counted_cents = excluded.cash_counted_cents,
    counts = excluded.counts, diff_reason = excluded.diff_reason, cash_removed_cents = excluded.cash_removed_cents,
    card_recorded_cents = excluded.card_recorded_cents, card_stripe_cents = coalesce(excluded.card_stripe_cents, public.day_closes.card_stripe_cents),
    left_open = excluded.left_open, summary = excluded.summary, closed_by = excluded.closed_by, closed_at = now()
  returning * into row;

  insert into public.audit_log (salon_id, person_id, action, detail)
  values (sid, public.my_person_id(), 'day.closed', jsonb_build_object('day', d, 'expected_cents', row.cash_expected_cents,
    'counted_cents', row.cash_counted_cents, 'diff_cents', row.cash_counted_cents - row.cash_expected_cents, 'by', by_m));
  return jsonb_build_object('ok', true, 'day', d, 'expected_cents', row.cash_expected_cents, 'counted_cents', row.cash_counted_cents,
    'diff_cents', row.cash_counted_cents - row.cash_expected_cents, 'tomorrow_start_cents', row.cash_counted_cents - row.cash_removed_cents);
end $$;

-- ---------- payout sheet ----------
-- Per person for days [p_from, p_to] (salon calendar): services done, pay (commission on full service price, or hourly from
-- clock-ins), tips (card + cash, minus card fee on tips only where allowed), total, check vs cash split. Refunded tickets don't count.
create function public._payout(p_salon uuid, p_from date, p_to date, p_only uuid)
returns table (membership_id uuid, name text, role public.member_role, pay_type public.pay_type, commission_pct numeric, hourly_cents integer,
  check_pct smallint, tickets int, services_cents bigint, minutes int, pay_cents bigint, tips_card_cents bigint, tips_cash_cents bigint,
  tip_fee_cents bigint, total_cents bigint, check_cents bigint, cash_cents bigint)
language sql stable set search_path = '' as $$
  with b as (select public._day_lo(p_salon, p_from) lo, public._day_lo(p_salon, p_to + 1) hi),
  svc as (
    select l.staff_id, count(distinct t.id)::int n, sum(l.amount_cents)::bigint cents
    from public.ticket_lines l join public.tickets t on t.id = l.ticket_id, b
    where t.salon_id = p_salon and t.status = 'paid' and t.paid_at >= b.lo and t.paid_at < b.hi
      and l.kind = 'service' and l.removed_at is null and l.staff_id is not null
    group by l.staff_id),
  ev as (
    select ce.membership_id, ce.kind, ce.at, lead(ce.kind) over w nk, lead(ce.at) over w nat
    from public.clock_events ce, b where ce.salon_id = p_salon and ce.at >= b.lo and ce.at < b.hi
    window w as (partition by ce.membership_id order by ce.at)),
  hrs as (select membership_id, (sum(extract(epoch from (nat - at))) / 60)::int mins from ev where kind = 'in' and nk = 'out' group by membership_id),
  tp as (select * from public._tips(p_salon, (select lo from b), (select hi from b))),
  base as (
    select m.id, m.display_name, m.role, m.pay_type, m.commission_pct, m.hourly_cents, m.check_pct,
      coalesce(svc.n, 0) n, coalesce(svc.cents, 0) sc, coalesce(hrs.mins, 0) mins,
      case m.pay_type when 'commission' then round(coalesce(svc.cents, 0) * coalesce(m.commission_pct, 0) / 100)::bigint
                      when 'hourly' then round(coalesce(hrs.mins, 0) * coalesce(m.hourly_cents, 0) / 60.0)::bigint
                      else 0 end pay,
      coalesce(tp.card_cents, 0) tc, coalesce(tp.cash_cents, 0) tk, coalesce(tp.fee_cents, 0) tf
    from public.memberships m
    left join svc on svc.staff_id = m.id left join hrs on hrs.membership_id = m.id left join tp on tp.membership_id = m.id
    where m.salon_id = p_salon and (p_only is null or m.id = p_only)
      and (m.archived_at is null or svc.n is not null or tp.membership_id is not null)
      and (m.role = 'tech' or svc.n is not null or tp.membership_id is not null or hrs.mins is not null))
  select id, display_name, role, pay_type, commission_pct, hourly_cents, check_pct, n, sc, mins, pay, tc, tk, tf,
    pay + tc + tk - tf, round((pay + tc + tk - tf) * check_pct / 100.0)::bigint,
    (pay + tc + tk - tf) - round((pay + tc + tk - tf) * check_pct / 100.0)::bigint
  from base order by role = 'tech' desc, display_name $$;

-- Owner / manager: everyone.
create function public.payout_sheet(p_salon uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'pick up to 2 months'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from public._payout(p_salon, p_from, p_to, null) x), '[]');
end $$;

-- A tech (or anyone) on their own login: only their own row.
create function public.my_earnings(p_salon uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare mid uuid;
begin
  select m.id into mid from public.memberships m where m.salon_id = p_salon and m.person_id = public.my_person_id() and m.archived_at is null;
  if mid is null then raise exception 'not a member'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'pick up to 2 months'; end if;
  return (select to_jsonb(x) from public._payout(p_salon, p_from, p_to, mid) x);
end $$;

-- On the salon device: name + PIN → that person's own earnings (to print their slip).
create function public.pin_earnings(p_device uuid, p_membership uuid, p_pin text, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb := public._check_pin(p_device, p_membership, p_pin);
begin
  if not (r->>'ok')::boolean then return r; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'pick up to 2 months'; end if;
  return r || jsonb_build_object('earnings', (select to_jsonb(x) from public._payout((r->>'salon_id')::uuid, p_from, p_to, p_membership) x));
end $$;

-- Owner sets the check / cash split per person.
create function public.set_check_pct(p_membership uuid, p_pct int) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (select salon_id from public.memberships where id = p_membership);
begin
  if sid is null or not public.is_admin(sid) then raise exception 'not allowed'; end if;
  update public.memberships set check_pct = least(greatest(p_pct, 0), 100) where id = p_membership;
end $$;

-- ---------- grants ----------
revoke execute on function public._day_lo(uuid, date), public._drawer_start(uuid, date), public._tips(uuid, timestamptz, timestamptz),
  public._payout(uuid, date, date, uuid) from public, anon, authenticated;
revoke execute on function public.day_summary(uuid, date), public.close_day(jsonb), public.payout_sheet(uuid, date, date),
  public.my_earnings(uuid, date, date), public.pin_earnings(uuid, uuid, text, date, date), public.set_check_pct(uuid, int) from public, anon;
grant execute on function public.day_summary(uuid, date), public.close_day(jsonb), public.payout_sheet(uuid, date, date),
  public.my_earnings(uuid, date, date), public.pin_earnings(uuid, uuid, text, date, date), public.set_check_pct(uuid, int) to authenticated;
