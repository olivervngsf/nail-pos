-- Test salon for the Pilot Test Plan: "Lotus Test Nails" with one person per role.
-- Test-project only (never live). Safe to re-run. People link on first sign-in by phone (claim_memberships).
-- Test phones + fixed codes are set in Supabase Auth > Phone > "Test phone numbers and OTPs".
do $$
declare sid uuid := '7e570000-0000-4000-8000-000000000001';
begin
  insert into public.salons (id, name, phone, address, state, setup_step)
  values (sid, 'Lotus Test Nails', '+14085550100', '1550 S Bascom Ave, Campbell', 'CA', 9)
  on conflict (id) do update set name = excluded.name, setup_step = 9;

  insert into public.memberships (id, salon_id, display_name, phone, role, pay_type, commission_pct, hourly_cents, pin_hash) values
    ('7e570000-0000-4000-8000-0000000000a1', sid, 'Test Owner',   '+15550100001', 'owner',      null,         null, null, null),
    ('7e570000-0000-4000-8000-0000000000a2', sid, 'Test Manager', '+15550100002', 'manager',    'hourly',     null, 1800, extensions.crypt('3690', extensions.gen_salt('bf'))),
    ('7e570000-0000-4000-8000-0000000000a3', sid, 'Hanh',         '+15550100003', 'front_desk', 'hourly',     null, 1600, extensions.crypt('2580', extensions.gen_salt('bf'))),
    ('7e570000-0000-4000-8000-0000000000a4', sid, 'Linh',         '+15550100004', 'tech',       'commission', 60,   null, extensions.crypt('1357', extensions.gen_salt('bf'))),
    ('7e570000-0000-4000-8000-0000000000a5', sid, 'Kim',          '+15550100005', 'tech',       'commission', 60,   null, extensions.crypt('2468', extensions.gen_salt('bf')))
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, pin_fails = 0, pin_locked_until = null;

  insert into public.salon_hours (salon_id, weekday, is_open, opens, closes)
  select sid, d, true, case when d < 6 then '09:00'::time else '10:00'::time end, case when d < 6 then '19:00'::time else '17:00'::time end
  from generate_series(0, 6) d
  on conflict (salon_id, weekday) do nothing;

  insert into public.services (id, salon_id, category, name, minutes, price_cents, sort)
  select ('7e570000-0000-4000-8000-0000000005' || lpad(n::text, 2, '0'))::uuid, sid, c, nm, mi, pr, n from (values
    (1, 'Pedicures', 'Regular spa pedicure', 45, 3800), (2, 'Pedicures', 'Deluxe spa pedicure', 50, 4800),
    (3, 'Manicures', 'Regular manicure', 30, 3000), (4, 'Gel color', 'Gel color manicure', 45, 4500),
    (5, 'Gel color', 'Gel color pedicure', 60, 5300), (6, 'Add-ons', 'French tip', 10, 700),
    (7, 'Enhancements', 'Acrylic full set', 75, 4800), (8, 'Enhancements', 'Acrylic fill-in', 45, 3800),
    (9, 'Dipping', 'Dipping powder - no tips', 60, 4800), (10, 'Waxing', 'Eyebrows', 15, 1200)
  ) v(n, c, nm, mi, pr)
  on conflict (id) do nothing;
end $$;
