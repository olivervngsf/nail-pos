-- Session 9 (M11): Today + Owner Numbers. No new truth tables: one read-only function returns the raw facts for a time range
-- (paid tickets with their lines, walk-ins, clock-in shifts, no-shows, visits for "came back", gift cards used, lost regulars).
-- The app works every number out from these rows (src/lib/numbers/kpis.ts, unit-tested with fixed data).
-- Owner + manager only (is_admin): techs and front desk can't read sales or other people's numbers.
create function public.numbers_facts(p_salon uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tz text; ms timestamptz;
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if p_to <= p_from or p_to - p_from > interval '100 days' then raise exception 'range too long'; end if;
  select time_zone into tz from public.salons where id = p_salon;
  ms := date_trunc('month', now() at time zone tz) at time zone tz;
  return jsonb_build_object(
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name) order by m.display_name)
      from public.memberships m where m.salon_id = p_salon and m.archived_at is null), '[]'),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'paidAt', t.paid_at, 'client', t.client_id,
        'newClient', t.client_id is not null and not exists (select 1 from public.tickets o where o.client_id = t.client_id and o.status = 'paid' and o.paid_at < t.paid_at),
        'source', (select a.source from public.appointments a where a.client_id = t.client_id order by a.created_at limit 1),
        'sales', coalesce((select sum(l.amount_cents) from public.ticket_lines l where l.ticket_id = t.id and l.removed_at is null and l.kind in ('service', 'discount')), 0),
        'tips', coalesce((select sum(l.amount_cents) from public.ticket_lines l where l.ticket_id = t.id and l.removed_at is null and l.kind = 'tip'), 0),
        'giftSold', coalesce((select sum(l.amount_cents) from public.ticket_lines l where l.ticket_id = t.id and l.removed_at is null and l.kind = 'gift_sale'), 0),
        'fees', coalesce((select sum(p.fee_cents) from public.payments p where p.ticket_id = t.id and p.status = 'paid'), 0),
        -- Booked their next visit the same day (before leaving).
        'rebooked', t.client_id is not null and exists (select 1 from public.appointments a where a.client_id = t.client_id and a.start_at > t.paid_at
          and a.status not in ('canceled', 'no_show', 'walked_out') and (a.created_at at time zone tz)::date = (t.paid_at at time zone tz)::date),
        'lines', coalesce((select jsonb_agg(jsonb_build_object('staff', l.staff_id, 'cents', l.amount_cents, 'kind', l.kind))
          from public.ticket_lines l where l.ticket_id = t.id and l.removed_at is null and l.kind in ('service', 'tip')), '[]')) order by t.paid_at)
      from public.tickets t where t.salon_id = p_salon and t.status = 'paid' and t.paid_at >= p_from and t.paid_at < p_to), '[]'),
    'walkins', coalesce((select jsonb_agg(jsonb_build_object('came', coalesce(a.arrived_at, a.start_at),
        'seatedAt', case when a.status in ('arrived', 'done') then a.start_at end, 'walkedOut', a.status = 'walked_out'))
      from public.appointments a where a.salon_id = p_salon and a.source in ('kiosk', 'walk_in')
        and coalesce(a.arrived_at, a.start_at) >= p_from and coalesce(a.arrived_at, a.start_at) < p_to), '[]'),
    -- Clock-in → next clock event (an open shift runs to now, at most 12 hours).
    'shifts', coalesce((select jsonb_agg(jsonb_build_object('staff', s.membership_id, 'from', s.at, 'to', s.until))
      from (select e.membership_id, e.at, e.kind,
              coalesce(case when lead(e.kind) over w = 'out' then lead(e.at) over w end,
                       least(now(), e.at + interval '12 hours', coalesce(lead(e.at) over w, 'infinity'))) as until
            from public.clock_events e where e.salon_id = p_salon and e.at >= p_from - interval '1 day' and e.at < p_to
            window w as (partition by e.membership_id order by e.at)) s
      where s.kind = 'in' and s.until > p_from), '[]'),
    'noShows', coalesce((select jsonb_agg(jsonb_build_object('at', a.start_at,
        'cents', coalesce((select sum((x->>'cents')::bigint) from jsonb_array_elements(a.services) x), 0)))
      from public.appointments a where a.salon_id = p_salon and a.status = 'no_show' and a.start_at >= p_from and a.start_at < p_to), '[]'),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('client', t.client_id, 'at', t.paid_at))
      from public.tickets t where t.salon_id = p_salon and t.status = 'paid' and t.client_id is not null
        and t.paid_at >= p_from - interval '84 days' and t.paid_at < p_to), '[]'),
    'giftUsed', coalesce((select jsonb_agg(jsonb_build_object('at', p.at, 'cents', p.amount_cents))
      from public.payments p where p.salon_id = p_salon and p.method = 'gift_card' and p.status = 'paid' and p.at >= p_from and p.at < p_to), '[]'),
    'lost', coalesce((select jsonb_agg(jsonb_build_object('name', c.name) order by f.last_visit)
      from public.clients c join public._client_facts(p_salon) f on f.client_id = c.id
      where c.archived_at is null and public._client_tag(f.visits, f.last_visit, f.gap_days, f.first_visit, c.created_at, ms) = 'lost'), '[]'));
end $$;

-- Today · needs attention (desk + owner): facts that need someone, never money.
create function public.today_attention(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tz text; d0 timestamptz; d1 timestamptz;
begin
  if not public._is_desk(p_salon) then raise exception 'not allowed'; end if;
  select time_zone into tz from public.salons where id = p_salon;
  d0 := date_trunc('day', now() at time zone tz) at time zone tz; d1 := d0 + interval '1 day';
  return jsonb_build_object(
    'licenses', coalesce((select jsonb_agg(jsonb_build_object('name', m.display_name, 'expires', m.license_expires) order by m.license_expires)
      from public.memberships m where m.salon_id = p_salon and m.archived_at is null and m.license_expires is not null
        and m.license_expires <= (now() at time zone tz)::date + 30), '[]'),
    'birthdays', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'birthday', c.birthday, 'visits', f.visits) order by
        make_date(extract(year from now() at time zone tz)::int, extract(month from c.birthday)::int, least(extract(day from c.birthday)::int, 28)))
      from public.clients c join public._client_facts(p_salon) f on f.client_id = c.id
      where c.archived_at is null and c.birthday is not null and f.visits >= 3
        and (make_date(extract(year from now() at time zone tz)::int, extract(month from c.birthday)::int, least(extract(day from c.birthday)::int, 28))
             - (now() at time zone tz)::date) between 0 and 7), '[]'),
    'readyForBill', coalesce((select jsonb_agg(jsonb_build_object('ticketId', t.id, 'name', coalesce(c.name, ''), 'cents', t.subtotal_cents - t.discount_cents))
      from public.appointments a join public.tickets t on t.id = a.ticket_id left join public.clients c on c.id = t.client_id
      where a.salon_id = p_salon and a.status = 'arrived' and a.end_at <= now() and a.start_at >= d0 and t.status = 'open'), '[]'));
end $$;

revoke execute on function public.numbers_facts(uuid, timestamptz, timestamptz), public.today_attention(uuid) from public, anon;
grant execute on function public.numbers_facts(uuid, timestamptz, timestamptz), public.today_attention(uuid) to authenticated;
