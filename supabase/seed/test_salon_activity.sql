-- Lived-in "Lotus Test Nails": 30 clients, 3 weeks of paid tickets (cash + card, tips, card fees), today's open tickets,
-- bookings this week (every channel), walk-ins waiting, gift cards (sold + used), loyalty points (earned by the real trigger),
-- staff clock-ins. TEST PROJECT ONLY. Run test_salon.sql first.
-- Re-run any time: it wipes THIS salon's activity (tickets, clients, bookings, cards, points, clocks) and rebuilds it around today.
-- Rows go in the same shape the app writes them (save_ticket / settle_card / gift + loyalty triggers), so every screen reads them as real.
-- Days are not closed on purpose: close yesterday yourself on /close-day to test it.

-- One ticket the way checkout makes it: open -> lines -> payment(s) -> paid (triggers give points / activate gift cards).
create or replace function pg_temp.seed_ticket(
  p_at timestamptz, p_client uuid, p_tech uuid, p_svcs int[], p_tip bigint, p_method text,
  p_open boolean default false, p_sell_card uuid default null, p_sell_cents bigint default 0,
  p_pay_card uuid default null, p_reward boolean default false
) returns uuid language plpgsql as $$
declare
  sid uuid := '7e570000-0000-4000-8000-000000000001';
  desk uuid := '7e570000-0000-4000-8000-0000000000a3';
  tid uuid := gen_random_uuid(); num int; sub bigint; mins int; disc bigint := 0; total bigint; due bigint; gamt bigint := 0;
  pay_at timestamptz; card boolean := p_method = 'card_reader'; i int := 0; s record;
begin
  insert into public.ticket_counters (salon_id, last) values (sid, 1001) on conflict (salon_id) do update set last = public.ticket_counters.last + 1
  returning last into num;
  insert into public.tickets (id, salon_id, number, client_id, status, opened_by, created_at, updated_at)
  values (tid, sid, num, p_client, 'open', desk, p_at, p_at);

  for s in select * from public.services where salon_id = sid and sort = any (p_svcs) order by array_position(p_svcs, sort::int) loop
    i := i + 1;
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, service_id, staff_id, name, minutes, amount_cents, price_from, sort)
    values (gen_random_uuid(), sid, tid, 'service', s.id, p_tech, s.name, s.minutes, s.price_cents, s.price_from, i);
  end loop;
  select coalesce(sum(amount_cents), 0), coalesce(sum(minutes), 0) into sub, mins from public.ticket_lines where ticket_id = tid;
  if p_reward then
    disc := least(1000, sub);
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, name, amount_cents, sort)
    values (gen_random_uuid(), sid, tid, 'loyalty_reward', 'Points reward', -disc, 900);
  end if;
  if p_sell_card is not null then
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, name, amount_cents, gift_card_id, sort)
    values (gen_random_uuid(), sid, tid, 'gift_sale', 'Gift card', p_sell_cents, p_sell_card, 950);
  end if;
  if p_tip > 0 then
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, staff_id, name, amount_cents, sort)
    values (gen_random_uuid(), sid, tid, 'tip', p_tech, case when card then 'Card tip' else 'Tip' end, p_tip, 1000);
  end if;
  total := sub - disc + p_tip + p_sell_cents;
  update public.tickets set subtotal_cents = sub, discount_cents = disc, tip_cents = p_tip, gift_cents = p_sell_cents, total_cents = total
  where id = tid;
  if p_open then return tid; end if;

  pay_at := p_at + make_interval(mins => greatest(mins, 15) + 5);
  due := total;
  if p_pay_card is not null then
    gamt := least(public._gift_balance(p_pay_card), sub - disc);
    if gamt > 0 then
      with p as (
        insert into public.payments (id, salon_id, ticket_id, method, amount_cents, gift_card_id, card_last4, taken_by, at)
        select gen_random_uuid(), sid, tid, 'gift_card', gamt, g.id, g.last4, desk, pay_at from public.gift_cards g where g.id = p_pay_card
        returning id
      )
      insert into public.gift_card_ledger (salon_id, card_id, ticket_id, payment_id, change_cents, reason, by_member, at)
      select sid, p_pay_card, tid, p.id, -gamt, 'used', desk, pay_at from p;
      if public._gift_balance(p_pay_card) = 0 then update public.gift_cards set status = 'used_up' where id = p_pay_card; end if;
      due := due - gamt;
    end if;
  end if;
  if due > 0 then
    if card then
      insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, fee_cents, stripe_payment_intent, card_brand, card_last4, taken_by, at)
      values (gen_random_uuid(), sid, tid, 'card_reader', due, p_tip, round(due * 0.027) + 5, 'pi_demo_' || replace(tid::text, '-', ''),
              (array['visa', 'visa', 'mastercard', 'amex', 'discover'])[1 + floor(random() * 5)::int], lpad((floor(random() * 10000))::int::text, 4, '0'), desk, pay_at);
    else
      insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, given_cents, change_cents, taken_by, at)
      values (gen_random_uuid(), sid, tid, 'cash', due, p_tip, ceil(due / 2000.0) * 2000, ceil(due / 2000.0) * 2000 - due, desk, pay_at);
    end if;
  end if;
  update public.tickets set status = 'paid', paid_at = pay_at, paid_by = desk, updated_at = pay_at where id = tid;
  -- Triggers stamp now(); move their rows to the ticket's real time.
  update public.loyalty_ledger set at = pay_at where ticket_id = tid;
  update public.gift_card_ledger set at = pay_at where ticket_id = tid and reason in ('sold', 'reload');
  return tid;
end $$;

do $$
declare
  sid uuid := '7e570000-0000-4000-8000-000000000001';
  tz text := 'America/Los_Angeles';
  today date := (now() at time zone 'America/Los_Angeles')::date;
  desk uuid := '7e570000-0000-4000-8000-0000000000a3';
  mgr uuid := '7e570000-0000-4000-8000-0000000000a2';
  techs uuid[] := array['7e570000-0000-4000-8000-0000000000a4', '7e570000-0000-4000-8000-0000000000a5', '7e570000-0000-4000-8000-0000000000a6',
                        '7e570000-0000-4000-8000-0000000000a7', '7e570000-0000-4000-8000-0000000000a8']::uuid[];
  mains int[] := array[1, 1, 1, 2, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 10, 10, 11, 11, 12, 13, 14, 18, 19, 19, 20, 21, 22, 23, 24, 25, 26, 27, 27, 28, 29];
  extras int[] := array[15, 16, 17, 30, 30, 31, 34];
  sources text[] := array['desk', 'desk', 'phone', 'web', 'google', 'text', 'instagram', 'website', 'qr'];
  cl uuid[]; d date; off int; k int; nt int; at timestamptz; tech uuid; cid uuid; svcs int[]; tip bigint; sub bigint; mins int;
  tid uuid; usual uuid; g1 uuid; g2 uuid; g3 uuid; top uuid; wd int; day_off boolean; o int;
begin
  perform setseed(0.1717);

  -- ---------- wipe this salon's activity (test salon only) ----------
  delete from public.reminders where salon_id = sid;
  delete from public.appointments where salon_id = sid;
  delete from public.repeat_rules where salon_id = sid;
  delete from public.loyalty_ledger where salon_id = sid;
  delete from public.gift_card_ledger where salon_id = sid;
  delete from public.refunds where salon_id = sid;
  delete from public.stripe_events where salon_id = sid;
  delete from public.pay_requests where salon_id = sid;
  delete from public.receipts where salon_id = sid;
  delete from public.client_notes where salon_id = sid;
  delete from public.client_photos where salon_id = sid;
  delete from public.payments where salon_id = sid;
  delete from public.ticket_lines where salon_id = sid;
  delete from public.discount_approvals where salon_id = sid;
  delete from public.gift_attempts where salon_id = sid;
  update public.gift_cards set replaced_by = null where salon_id = sid;
  delete from public.gift_cards where salon_id = sid;
  delete from public.tickets where salon_id = sid;
  delete from public.client_private where salon_id = sid;
  delete from public.clients where salon_id = sid;
  delete from public.clock_events where salon_id = sid;
  delete from public.day_closes where salon_id = sid;
  delete from public.ticket_counters where salon_id = sid;

  -- ---------- 30 clients (first 8 = regulars) ----------
  insert into public.clients (salon_id, phone, name, language, texts_ok, birthday, usual_staff, shape, colors, care, notes, created_at)
  select sid, '+1408555' || (1000 + n), nm, lg, n % 7 <> 0, bd, case when us > 0 then techs[us] end, sh, co, ca, '',
         now() - make_interval(days => 400 - n * 11)
  from (values
    (1,  'Jennifer Morales', 'en', date '1988-03-14', 1, 'Almond', 'OPI Bubble Bath', 'Likes short nails, sensitive cuticles'),
    (2,  'Ashley Kim',       'en', date '1995-11-22', 2, 'Coffin', 'Nude + chrome', ''),
    (3,  'Nguyen Thi Lan',   'vi', date '1972-07-02', 5, 'Round',  'Red', 'Bad knee: low chair for pedicure'),
    (4,  'Maria Gonzalez',   'en', date '1983-12-01', 1, 'Square', 'French white', ''),
    (5,  'Sarah Johnson',    'en', date '1990-05-30', 4, 'Oval',   'Pastel pink', 'Allergic to lavender oil'),
    (6,  'Emily Chen',       'en', date '1999-09-09', 2, 'Stiletto', 'Black matte', ''),
    (7,  'Tran Minh Thu',    'vi', date '1980-02-18', 3, 'Square', 'Gel nude', ''),
    (8,  'Linda Patel',      'en', date '1965-11-25', 1, 'Round',  'Clear', 'Diabetic: no cutting on toes'),
    (9,  'Jessica Brown',    'en', null::date,             0, '', '', ''),
    (10, 'Amanda Lee',       'en', date '1992-01-11', 0, 'Almond', '', ''),
    (11, 'Pham Hoa',         'vi', null,             3, '', '', ''),
    (12, 'Rachel Green',     'en', date '1994-06-17', 0, '', 'Coral', ''),
    (13, 'Michelle Wong',    'en', null,             2, 'Coffin', '', ''),
    (14, 'Karen Davis',      'en', date '1970-08-08', 0, '', '', ''),
    (15, 'Stephanie Nguyen', 'en', date '1997-04-04', 4, '', 'Glitter', ''),
    (16, 'Lisa Martinez',    'en', null,             0, '', '', ''),
    (17, 'Hoang Mai',        'vi', null,             0, '', '', ''),
    (18, 'Nicole Taylor',    'en', date '1989-11-20', 0, 'Oval', '', ''),
    (19, 'Kimberly Wilson',  'en', null,             1, '', '', ''),
    (20, 'Angela Rivera',    'en', null,             0, '', '', ''),
    (21, 'Christine Park',   'en', date '1991-10-05', 2, '', '', ''),
    (22, 'Melissa Clark',    'en', null,             0, '', '', ''),
    (23, 'Vo Thanh Huong',   'vi', null,             5, '', '', ''),
    (24, 'Laura Scott',      'en', null,             0, '', '', ''),
    (25, 'Brittany Hall',    'en', null,             0, '', '', ''),
    (26, 'Diana Lopez',      'en', null,             0, '', '', ''),
    (27, 'Megan Adams',      'en', null,             0, '', '', ''),
    (28, 'Olivia Turner',    'en', null,             0, '', '', ''),
    (29, 'Grace Kim',        'en', null,             0, '', '', ''),
    (30, 'Hannah White',     'en', null,             0, '', '', '')
  ) v(n, nm, lg, bd, us, sh, co, ca);
  update public.clients set care_by = desk, care_at = now() - interval '20 days' where salon_id = sid and care <> '';
  select array_agg(id order by phone) into cl from public.clients where salon_id = sid;

  -- ---------- 3 weeks of tickets + staff clock-ins ----------
  for off in reverse 21..0 loop
    d := today - off;
    wd := extract(dow from d)::int;  -- 0 = Sunday
    -- Clock-ins: manager + desk every day; techs except days off (Tuan Tue, Thao Sun+Mon, Vy Wed).
    for o in 0..6 loop
      tech := (array[mgr, desk] || techs)[o + 1];
      day_off := (tech = techs[3] and wd = 2) or (tech = techs[5] and wd in (0, 1)) or (tech = techs[4] and wd = 3);
      continue when day_off;
      at := ((d + time '08:52') at time zone tz) + make_interval(mins => floor(random() * 15)::int);
      continue when at > now();
      insert into public.clock_events (salon_id, membership_id, kind, source, at) values (sid, tech, 'in', 'pin', at);
      if off > 0 then
        insert into public.clock_events (salon_id, membership_id, kind, source, at)
        values (sid, tech, 'out', 'pin', ((d + time '19:05') at time zone tz) + make_interval(mins => floor(random() * 20)::int));
      end if;
    end loop;

    nt := 9 + floor(random() * 6)::int + case when wd in (5, 6) then 4 else 0 end;
    for k in 1..nt loop
      at := ((d + time '09:15') at time zone tz) + make_interval(mins => floor(random() * 540)::int);
      continue when at > now() - interval '20 minutes';
      cid := case when random() < 0.45 then cl[1 + floor(random() * 8)::int]
                  when random() < 0.75 then cl[1 + floor(random() * 30)::int] end;
      usual := null;
      select usual_staff into usual from public.clients where id = cid;
      loop
        tech := case when usual is not null and random() < 0.65 then usual else techs[1 + floor(random() * 5)::int] end;
        exit when not ((tech = techs[3] and wd = 2) or (tech = techs[5] and wd in (0, 1)) or (tech = techs[4] and wd = 3));
        usual := null;
      end loop;
      svcs := array[mains[1 + floor(random() * array_length(mains, 1))::int]];
      if random() < 0.3 then svcs := svcs || extras[1 + floor(random() * array_length(extras, 1))::int]; end if;
      select sum(price_cents), sum(minutes) into sub, mins from public.services where salon_id = sid and sort = any (svcs);
      tip := case when random() < 0.1 then 0 else round(sub * (0.15 + random() * 0.08) / 100) * 100 end;
      tid := pg_temp.seed_ticket(at, cid, tech, svcs, tip, case when random() < 0.62 then 'card_reader' else 'cash' end,
                                 off = 0 and at + make_interval(mins => mins + 5) > now());
      -- Booked ahead (some regulars) or walked in: the calendar shows where each visit came from.
      if cid is not null and random() < 0.5 then
        insert into public.appointments (id, salon_id, client_id, client_name, staff_id, start_at, end_at, services, status, source, ticket_id, created_by, arrived_at, created_at)
        select gen_random_uuid(), sid, cid, c.name, tech, at, at + make_interval(mins => mins),
               (select jsonb_agg(jsonb_build_object('serviceId', s.id, 'name', s.name, 'minutes', s.minutes, 'cents', s.price_cents)) from public.services s where s.salon_id = sid and s.sort = any (svcs)),
               case when off = 0 and at + make_interval(mins => mins + 5) > now() then 'arrived' else 'done' end,
               sources[1 + floor(random() * array_length(sources, 1))::int], tid, desk, at - interval '5 minutes', at - interval '3 days'
        from public.clients c where c.id = cid;
      elsif random() < 0.5 then
        insert into public.appointments (id, salon_id, client_id, client_name, staff_id, start_at, end_at, services, status, source, ticket_id, created_by, arrived_at, created_at, seat_reason)
        select gen_random_uuid(), sid, cid, coalesce((select name from public.clients where id = cid), 'Walk-in'), tech, at, at + make_interval(mins => mins),
               (select jsonb_agg(jsonb_build_object('serviceId', s.id, 'name', s.name, 'minutes', s.minutes, 'cents', s.price_cents)) from public.services s where s.salon_id = sid and s.sort = any (svcs)),
               case when off = 0 and at + make_interval(mins => mins + 5) > now() then 'arrived' else 'done' end,
               case when random() < 0.5 then 'walk_in' else 'kiosk' end, tid, desk, at - make_interval(mins => 5 + floor(random() * 20)::int), at - interval '20 minutes',
               (array[null, null, 'next in turn', 'client asked', 'free now'])[1 + floor(random() * 5)::int];
      end if;
    end loop;
  end loop;

  -- ---------- gift cards: 3 sold (cash), one partly used, one used up ----------
  -- Codes (type at checkout): LQTU-TEST-CARD-X25P ($55 left), LQTU-TEST-CARD-X55H (used up), LQTU-TEST-CARD-X99G ($25).
  insert into public.gift_cards (salon_id, code_hash, last4, kind, status, made_by)
  select sid, public._gift_hash(b || public._gift_check(b)), right(b || public._gift_check(b), 4), 'digital', 'in_stock', 'desk'
  from unnest(array['LQTUTESTCARDX25', 'LQTUTESTCARDX55', 'LQTUTESTCARDX99']) b;
  select id into g1 from public.gift_cards where salon_id = sid and code_hash = public._gift_hash('LQTUTESTCARDX25' || public._gift_check('LQTUTESTCARDX25'));
  select id into g2 from public.gift_cards where salon_id = sid and code_hash = public._gift_hash('LQTUTESTCARDX55' || public._gift_check('LQTUTESTCARDX55'));
  select id into g3 from public.gift_cards where salon_id = sid and code_hash = public._gift_hash('LQTUTESTCARDX99' || public._gift_check('LQTUTESTCARDX99'));
  perform pg_temp.seed_ticket(((today - 18) + time '14:10') at time zone tz, cl[1], techs[1], array[10], 900, 'cash', false, g1, 10000);
  perform pg_temp.seed_ticket(((today - 11) + time '11:30') at time zone tz, cl[12], techs[2], array[]::int[], 0, 'cash', false, g2, 5000);
  perform pg_temp.seed_ticket(((today - 6) + time '16:00') at time zone tz, cl[5], techs[4], array[2], 1000, 'card_reader', false, g3, 2500);
  update public.gift_cards set sent_to = '+14085551012', from_name = 'Mom', message = 'Happy birthday Rachel!' where id = g2;
  -- Used: Jennifer pays a $45 gel manicure from her $100 card; Rachel's friend spends all $50.
  perform pg_temp.seed_ticket(((today - 4) + time '10:20') at time zone tz, cl[1], techs[1], array[10], 800, 'cash', false, null, 0, g1);
  perform pg_temp.seed_ticket(((today - 2) + time '15:40') at time zone tz, cl[12], techs[2], array[2, 30], 1000, 'card_reader', false, null, 0, g2);

  -- ---------- loyalty: the client with the most points uses a $10 reward (yesterday) ----------
  select client_id into top from public.loyalty_ledger where salon_id = sid group by client_id having sum(change) >= 300 order by sum(change) desc limit 1;
  if top is not null then
    perform pg_temp.seed_ticket(((today - 1) + time '13:00') at time zone tz, top, techs[1], array[11], 1000, 'card_reader', false, null, 0, null, true);
  end if;

  -- ---------- bookings: rest of today + next 7 days, every channel ----------
  for off in 0..7 loop
    d := today + off;
    nt := 4 + floor(random() * 5)::int;
    for k in 1..nt loop
      at := ((d + time '10:00') at time zone tz) + make_interval(mins => 30 * floor(random() * 15)::int);
      continue when at < now() + interval '30 minutes';
      cid := cl[1 + floor(random() * 30)::int];
      svcs := array[mains[1 + floor(random() * array_length(mains, 1))::int]];
      select sum(minutes) into mins from public.services where salon_id = sid and sort = any (svcs);
      select usual_staff into tech from public.clients where id = cid;
      if tech is null or random() < 0.3 then tech := case when random() < 0.2 then null else techs[1 + floor(random() * 5)::int] end; end if;
      insert into public.appointments (id, salon_id, client_id, client_name, staff_id, start_at, end_at, services, status, source, note, created_by, created_at)
      select gen_random_uuid(), sid, cid, c.name, tech, at, at + make_interval(mins => mins),
             (select jsonb_agg(jsonb_build_object('serviceId', s.id, 'name', s.name, 'minutes', s.minutes, 'cents', s.price_cents)) from public.services s where s.salon_id = sid and s.sort = any (svcs)),
             case when off <= 1 and random() < 0.6 then 'confirmed' else 'booked' end,
             sources[1 + floor(random() * array_length(sources, 1))::int],
             case when random() < 0.15 then 'Wants Linh if free' else '' end, desk, now() - make_interval(days => floor(random() * 6)::int)
      from public.clients c where c.id = cid;
    end loop;
  end loop;
  -- Reminder texts waiting for upcoming bookings.
  insert into public.reminders (salon_id, appointment_id, kind, send_at, status)
  select sid, id, 'day_before', start_at - interval '1 day', 'queued' from public.appointments
  where salon_id = sid and status in ('booked', 'confirmed') and ticket_id is null and start_at - interval '1 day' > now();
  -- A no-show yesterday, a canceled one tomorrow.
  insert into public.appointments (id, salon_id, client_id, client_name, staff_id, start_at, end_at, services, status, source, created_by)
  values (gen_random_uuid(), sid, cl[20], 'Angela Rivera', techs[2], ((today - 1) + time '16:00') at time zone tz, ((today - 1) + time '16:45') at time zone tz,
          '[{"name": "Regular spa pedicure", "minutes": 45, "cents": 3800}]', 'no_show', 'web', desk),
         (gen_random_uuid(), sid, cl[22], 'Melissa Clark', techs[1], ((today + 1) + time '11:00') at time zone tz, ((today + 1) + time '11:45') at time zone tz,
          '[{"name": "Gel color manicure", "minutes": 45, "cents": 4500}]', 'canceled', 'text', desk);

  -- ---------- walk-ins waiting right now + one who left ----------
  insert into public.appointments (id, salon_id, client_id, client_name, staff_id, start_at, end_at, services, status, source, arrived_at, created_by)
  values (gen_random_uuid(), sid, null, 'Walk-in · Tina', null, now() - interval '14 minutes', now() + interval '31 minutes',
          '[{"name": "Regular spa pedicure", "minutes": 45, "cents": 3800}]', 'booked', 'walk_in', now() - interval '14 minutes', desk),
         (gen_random_uuid(), sid, cl[9], 'Jessica Brown', null, now() - interval '6 minutes', now() + interval '39 minutes',
          '[{"name": "Gel color manicure", "minutes": 45, "cents": 4500}]', 'booked', 'kiosk', now() - interval '6 minutes', null),
         (gen_random_uuid(), sid, null, 'Walk-in · 2 friends', null, now() - interval '95 minutes', now() - interval '50 minutes',
          '[{"name": "Regular manicure", "minutes": 30, "cents": 3000}]', 'walked_out', 'walk_in', now() - interval '95 minutes', desk);

  -- ---------- a few visit notes from techs ----------
  insert into public.client_notes (id, salon_id, client_id, author, body, at) values
    (gen_random_uuid(), sid, cl[1], techs[1], 'Chose OPI Bubble Bath again. Prefers 2 coats.', now() - interval '4 days'),
    (gen_random_uuid(), sid, cl[3], techs[5], 'Bà Lan thích ghế thấp, nước ấm vừa.', now() - interval '9 days'),
    (gen_random_uuid(), sid, cl[5], techs[4], 'No lavender oil. Used unscented lotion.', now() - interval '6 days');
end $$;

-- Gift card codes to type at checkout (shown once here, like the real receipt):
select public._gift_pretty(b || public._gift_check(b)) as gift_code,
       public._gift_balance(g.id) as balance_cents, g.status
from unnest(array['LQTUTESTCARDX25', 'LQTUTESTCARDX55', 'LQTUTESTCARDX99']) b
join public.gift_cards g on g.code_hash = public._gift_hash(b || public._gift_check(b));

-- See it in YOUR own account: add your person as an owner of this salon (salon switcher, top right), and as platform admin.
--   insert into public.memberships (salon_id, display_name, phone, role, person_id, user_id)
--   select '7e570000-0000-4000-8000-000000000001', p.name, p.phone, 'owner', p.id, p.auth_user_id from public.people p where p.phone = '+1YOURPHONE';
--   insert into public.platform_admins (auth_user_id, note) select auth_user_id, 'name' from public.people where phone = '+1YOURPHONE';
