-- "Right now" scene for Lotus Test Nails: fills the calendar's Live board the way the Live design shows it.
-- TEST PROJECT ONLY. Run after test_salon.sql (+ test_salon_activity.sql for history). Re-run any time (e.g. each
-- morning): it only removes ITS OWN rows from the last run (ids 5c0e0000-…) and adds today's scene around now().
-- Nothing else is wiped, so bookings you made by hand stay.
--   Linh   BUSY  · Jennifer Morales · Gel color manicure (started 25 min ago)
--   Kim    BUSY  · Ashley Kim · Acrylic full set (started 30 min ago)
--   Vy     BUSY  · Sarah Johnson · Deluxe spa pedicure (started 12 min ago)
--   Thao   NEXT UP / Client here · Emily Chen in 8 min (arrived early) + Linda Patel = To bill (time's up, not paid)
--   Tuan   NOT IN (not clocked in today)
--   Waitlist: Tina Vo 36 min · Jessica Brown 28 min (kiosk) · Walk-in Hoa 9 min
--   Later: Linh break, Kim web booking (not confirmed), Linh Instagram booking (confirmed), Vy phone booking
-- Every tech also gets skills (Settings → Team) so the booking drawer shows skill tags + Good fit.
do $$
declare
  sid uuid := '7e570000-0000-4000-8000-000000000001';
  tz text := 'America/Los_Angeles';
  desk uuid := '7e570000-0000-4000-8000-0000000000a3';
  mgr uuid := '7e570000-0000-4000-8000-0000000000a2';
  linh uuid := '7e570000-0000-4000-8000-0000000000a4';
  kim uuid := '7e570000-0000-4000-8000-0000000000a5';
  tuan uuid := '7e570000-0000-4000-8000-0000000000a6';
  vy uuid := '7e570000-0000-4000-8000-0000000000a7';
  thao uuid := '7e570000-0000-4000-8000-0000000000a8';
  t0 timestamptz := date_trunc('minute', now());
  day0 timestamptz := date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  m uuid;
begin
  -- ---------- clean up the last run (only our own ids) ----------
  delete from public.reminders where appointment_id::text like '5c0e0000-%';
  delete from public.appointments where id::text like '5c0e0000-%';
  delete from public.ticket_lines where ticket_id::text like '5c0e0000-%';
  delete from public.tickets where id::text like '5c0e0000-%';

  -- ---------- clock in today (Tuan stays out = "Not in") ----------
  foreach m in array array[desk, mgr, linh, kim, vy, thao] loop
    if coalesce((select kind from public.clock_events where membership_id = m and at >= day0 order by at desc limit 1), 'out') <> 'in' then
      insert into public.clock_events (salon_id, membership_id, kind, source, at)
      values (sid, m, 'in', 'pin', least(day0 + interval '8 hours 55 minutes', now() - interval '3 hours'));
    end if;
  end loop;
  insert into public.clock_events (salon_id, membership_id, kind, source, at)
  select sid, tuan, 'out', 'pin', now() - interval '1 minute'
  where coalesce((select kind from public.clock_events where membership_id = tuan order by at desc limit 1), 'out') = 'in';

  -- ---------- skills (only where none set yet) ----------
  update public.memberships set skills = v.sk from (values
    (linh, array['Gel', 'Acrylic']), (kim, array['Acrylic', 'Dip', 'Nail art']), (tuan, array['Dip', 'Acrylic']),
    (vy, array['Pedicure', 'Nail art']), (thao, array['Pedicure', 'Gel'])) v(id, sk)
  where memberships.id = v.id and coalesce(array_length(memberships.skills, 1), 0) = 0;

  -- ---------- helpers: services as the app stores them, a client by name ----------
  create temp table if not exists sv on commit drop as
    select sort, jsonb_build_object('serviceId', id, 'name', name, 'minutes', minutes, 'cents', price_cents) j, minutes, price_cents, id, name
    from public.services where salon_id = sid and archived_at is null;

  -- One visit: appointment (+ open ticket when in the chair / to bill).
  -- n = row number (id suffix), st = status, mins_ago = start relative to now (negative = future), with_ticket = open ticket.
  create temp table if not exists scene (n int, staff uuid, client text, svcs int[], start_off int, status text, source text, here_ago int, ticket boolean, note text) on commit drop;
  delete from scene;
  insert into scene values
    (1,  linh, 'Jennifer Morales', array[10],    -25, 'arrived',   'phone',     null, true,  ''),
    (2,  kim,  'Ashley Kim',       array[18],    -30, 'arrived',   'web',       null, true,  ''),
    (3,  vy,   'Sarah Johnson',    array[2],     -12, 'arrived',   'desk',      null, true,  ''),
    (4,  thao, 'Linda Patel',      array[1],     -55, 'arrived',   'phone',     null, true,  ''),
    (5,  thao, 'Emily Chen',       array[11],      8, 'confirmed', 'web',          3, false, ''),
    (6,  kim,  'Grace Kim',        array[8, 15],  95, 'booked',    'web',       null, false, ''),
    (7,  linh, 'Rachel Green',     array[19],    120, 'confirmed', 'instagram', null, false, ''),
    (8,  vy,   'Nicole Taylor',    array[6],      75, 'booked',    'phone',     null, false, 'Wants almond shape'),
    (9,  null, 'Tina Vo',          array[1],     -36, 'booked',    'walk_in',     36, false, 'B1'),
    (10, null, 'Jessica Brown',    array[10],    -28, 'booked',    'kiosk',       28, false, 'B2'),
    (11, null, 'Walk-in · Hoa',    array[6, 15],  -9, 'booked',    'walk_in',      9, false, 'B3');

  -- tickets for in-chair / to-bill visits
  insert into public.ticket_counters (salon_id, last) values (sid, 1001) on conflict (salon_id) do nothing;
  insert into public.tickets (id, salon_id, number, client_id, status, opened_by, created_at, updated_at, client_name)
  select ('5c0e0000-0000-4000-8000-1' || lpad(sc.n::text, 11, '0'))::uuid, sid,
         (select last from public.ticket_counters where salon_id = sid) + sc.n,
         (select id from public.clients c where c.salon_id = sid and c.name = sc.client limit 1), 'open', desk,
         t0 + make_interval(mins => sc.start_off), t0, sc.client
  from scene sc where sc.ticket;
  update public.ticket_counters set last = last + 20 where salon_id = sid;
  insert into public.ticket_lines (id, salon_id, ticket_id, kind, service_id, staff_id, name, minutes, amount_cents, sort)
  select gen_random_uuid(), sid, ('5c0e0000-0000-4000-8000-1' || lpad(sc.n::text, 11, '0'))::uuid, 'service', s.id, sc.staff, s.name, s.minutes, s.price_cents, x.o
  from scene sc, unnest(sc.svcs) with ordinality x(sort, o) join sv s on s.sort = x.sort where sc.ticket;
  update public.tickets t set subtotal_cents = (select sum(amount_cents) from public.ticket_lines l where l.ticket_id = t.id),
                              total_cents = (select sum(amount_cents) from public.ticket_lines l where l.ticket_id = t.id)
  where t.id::text like '5c0e0000-%';

  -- appointments
  insert into public.appointments (id, salon_id, client_id, client_name, staff_id, start_at, end_at, services, status, source, note,
                                   ticket_id, arrived_at, created_by, created_at)
  select ('5c0e0000-0000-4000-8000-0' || lpad(sc.n::text, 11, '0'))::uuid, sid,
         (select id from public.clients c where c.salon_id = sid and c.name = sc.client limit 1), sc.client, sc.staff,
         t0 + make_interval(mins => sc.start_off),
         t0 + make_interval(mins => sc.start_off + (select sum(s.minutes) from sv s where s.sort = any (sc.svcs))::int),
         (select jsonb_agg(s.j order by array_position(sc.svcs, s.sort)) from sv s where s.sort = any (sc.svcs)),
         sc.status, sc.source, sc.note,
         case when sc.ticket then ('5c0e0000-0000-4000-8000-1' || lpad(sc.n::text, 11, '0'))::uuid end,
         case when sc.here_ago is not null then t0 - make_interval(mins => sc.here_ago)
              when sc.status = 'arrived' then t0 + make_interval(mins => sc.start_off - 3) end,
         desk, now() - interval '2 days'
  from scene sc;

  -- a break on Linh's column right after her client
  insert into public.appointments (id, salon_id, client_name, staff_id, start_at, end_at, services, status, source, note, created_by)
  values ('5c0e0000-0000-4000-8000-000000000099', sid, '', linh, t0 + interval '30 minutes', t0 + interval '60 minutes', '[]', 'blocked', 'desk', '', desk);
end $$;

-- What the board should show now:
select coalesce(m.display_name, '(waitlist)') as tech, a.client_name, a.status, a.source,
       to_char(a.start_at at time zone 'America/Los_Angeles', 'HH12:MI AM') as starts
from public.appointments a left join public.memberships m on m.id = a.staff_id
where a.id::text like '5c0e0000-%' order by a.start_at;
