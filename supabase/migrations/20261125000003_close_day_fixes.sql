-- Fixes from review of the close-day migration (Nov 17):
--  * payout: archived hourly staff with hours in the period stay on the sheet; shifts crossing midnight are paired first,
--    then clipped to the period, so no hours are lost.
--  * close_day: always needs a 'close' OK (used once, credited to the person who gave it). On the salon device that is a
--    manager PIN; on an owner/manager's own login the screen asks for it in one tap.

create or replace function public._payout(p_salon uuid, p_from date, p_to date, p_only uuid)
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
  -- Pair clock-ins with clock-outs using a day on each side, then keep only the part of each shift inside the period
  -- (a shift from 11 PM to 1 AM pays 1 hour to each day).
  ev as (
    select ce.membership_id, ce.kind, ce.at, lead(ce.kind) over w nk, lead(ce.at) over w nat
    from public.clock_events ce, b where ce.salon_id = p_salon and ce.at >= b.lo - interval '1 day' and ce.at < b.hi + interval '1 day'
    window w as (partition by ce.membership_id order by ce.at)),
  hrs as (select membership_id, (sum(greatest(0, extract(epoch from (least(nat, b.hi) - greatest(at, b.lo))))) / 60)::int mins
    from ev, b where kind = 'in' and nk = 'out' and nat > b.lo and at < b.hi group by membership_id having sum(greatest(0, extract(epoch from (least(nat, b.hi) - greatest(at, b.lo))))) > 0),
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
      and (m.archived_at is null or svc.n is not null or tp.membership_id is not null or hrs.mins is not null)
      and (m.role = 'tech' or svc.n is not null or tp.membership_id is not null or hrs.mins is not null))
  select id, display_name, role, pay_type, commission_pct, hourly_cents, check_pct, n, sc, mins, pay, tc, tk, tf,
    pay + tc + tk - tf, round((pay + tc + tk - tf) * check_pct / 100.0)::bigint,
    (pay + tc + tk - tf) - round((pay + tc + tk - tf) * check_pct / 100.0)::bigint
  from base order by role = 'tech' desc, display_name $$;


create or replace function public.close_day(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := (p->>'salonId')::uuid; d date := (p->>'day')::date; s jsonb; counted bigint := 0; k text; v jsonb;
  by_m uuid; open_ids uuid[]; left_ids uuid[]; row public.day_closes;
begin
  if sid is null or d is null then raise exception 'salon and day required'; end if;
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;

  s := public.day_summary(sid, d);
  select array_agg((x->>'id')::uuid) into open_ids from jsonb_array_elements(s->'open') x;
  select array_agg((x->>'id')::uuid) into left_ids from jsonb_array_elements(coalesce(p->'leftOpen', '[]')) x where coalesce(x->>'reason', '') <> '';
  if exists (select 1 from unnest(coalesce(open_ids, '{}')) o where not (o = any (coalesce(left_ids, '{}')))) then
    raise exception 'tickets still open: take payment or leave open with a reason';
  end if;

  -- Always an owner/manager OK for 'close', used once and credited to whoever gave it (their PIN on the salon device, or
  -- their own login). A salon device runs on the session of the owner who set it up, so that session alone is not enough.
  update public.discount_approvals set used_at = now()
  where id = (p->>'approvalId')::uuid and salon_id = sid and purpose = 'close' and used_at is null and at > now() - interval '15 minutes'
  returning membership_id into by_m;
  if by_m is null then raise exception 'closing the day needs an owner or manager OK'; end if;

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

