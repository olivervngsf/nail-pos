-- Test salon "Lotus Test Nails": one sign-in per role, real Cosmo Nails menu. TEST PROJECT ONLY (never the live project).
-- Safe to re-run. People link on first sign-in by phone (claim_memberships), same path as a real invite.
-- Test phones + fixed codes: Supabase Auth > Phone > "Test phone numbers and OTPs" (e.g. 15550100001=123456 ... 15550100009=123456).
-- After this file, run test_salon_activity.sql for a lived-in salon (clients, 3 weeks of tickets, bookings, gift cards, points).
--
--   phone          who            role        PIN   pay
--   +15550100001   Lan Nguyen     owner       -     -
--   +15550100002   Mai Tran       manager     369000  hourly $18
--   +15550100003   Hanh           front_desk  258000  hourly $16
--   +15550100004   Linh           tech        135700  commission 60%, 70% by check
--   +15550100005   Kim            tech        246800  commission 60%
--   +15550100006   Tuan           tech        147000  commission 55%
--   +15550100007   Vy             tech        357900  commission 60% (license expires in 20 days -> alert)
--   +15550100008   Thao           tech        468000  booth renter
--   +15550100009   Test Admin     platform admin (no salon). Sign in once, then re-run this file (adds to platform_admins).
do $$
declare sid uuid := '7e570000-0000-4000-8000-000000000001';
begin
  insert into public.salons (id, name, phone, address, state, setup_step, time_zone)
  values (sid, 'Lotus Test Nails', '+14085550100', '1550 S Bascom Ave, Campbell', 'CA', 9, 'America/Los_Angeles')
  on conflict (id) do update set name = excluded.name, setup_step = 9, time_zone = excluded.time_zone;

  insert into public.memberships (id, salon_id, display_name, phone, role, pay_type, commission_pct, hourly_cents, check_pct, license_no, license_state, license_expires, language, pin_hash) values
    ('7e570000-0000-4000-8000-0000000000a1', sid, 'Lan Nguyen', '+15550100001', 'owner',      null,         null, null, 100, null,     null, null, 'en', null),
    ('7e570000-0000-4000-8000-0000000000a2', sid, 'Mai Tran',   '+15550100002', 'manager',    'hourly',     null, 1800, 100, null,     null, null, 'en', extensions.crypt('369000', extensions.gen_salt('bf'))),
    ('7e570000-0000-4000-8000-0000000000a3', sid, 'Hanh',       '+15550100003', 'front_desk', 'hourly',     null, 1600, 100, null,     null, null, 'vi', extensions.crypt('258000', extensions.gen_salt('bf'))),
    ('7e570000-0000-4000-8000-0000000000a4', sid, 'Linh',       '+15550100004', 'tech',       'commission', 60,   null, 70,  'M314159', 'CA', current_date + 400, 'vi', extensions.crypt('135700', extensions.gen_salt('bf'))),
    ('7e570000-0000-4000-8000-0000000000a5', sid, 'Kim',        '+15550100005', 'tech',       'commission', 60,   null, 100, 'M271828', 'CA', current_date + 300, 'vi', extensions.crypt('246800', extensions.gen_salt('bf'))),
    ('7e570000-0000-4000-8000-0000000000a6', sid, 'Tuan',       '+15550100006', 'tech',       'commission', 55,   null, 100, 'M161803', 'CA', current_date + 500, 'vi', extensions.crypt('147000', extensions.gen_salt('bf'))),
    ('7e570000-0000-4000-8000-0000000000a7', sid, 'Vy',         '+15550100007', 'tech',       'commission', 60,   null, 100, 'M141421', 'CA', current_date + 20,  'en', extensions.crypt('357900', extensions.gen_salt('bf'))),
    ('7e570000-0000-4000-8000-0000000000a8', sid, 'Thao',       '+15550100008', 'tech',       'booth_rent', null, null, 100, 'M173205', 'CA', current_date + 600, 'vi', extensions.crypt('468000', extensions.gen_salt('bf')))
  on conflict (id) do update set display_name = excluded.display_name, phone = excluded.phone, role = excluded.role, pay_type = excluded.pay_type,
    commission_pct = excluded.commission_pct, hourly_cents = excluded.hourly_cents, check_pct = excluded.check_pct, license_no = excluded.license_no,
    license_state = excluded.license_state, license_expires = excluded.license_expires, language = excluded.language, pin_hash = excluded.pin_hash,
    pin_fails = 0, pin_locked_until = null, archived_at = null;
  update public.memberships set pin_len = 6 where salon_id = sid and pin_hash is not null;  -- PINs are 6 digits (PIN rules)

  insert into public.salon_hours (salon_id, weekday, is_open, opens, closes)
  select sid, d, true, case when d < 6 then '09:00'::time else '10:00'::time end, case when d < 6 then '19:00'::time else '17:00'::time end
  from generate_series(0, 6) d
  on conflict (salon_id, weekday) do nothing;

  -- Real menu: Cosmo Nails (cosmonailswildwood.com/services). Minutes are our estimate (the site shows none). "+" = price_from.
  insert into public.services (id, salon_id, category, name, minutes, price_cents, price_from, sort, archived_at)
  select ('7e570000-0000-4000-8000-0000000005' || lpad(n::text, 2, '0'))::uuid, sid, c, nm, mi, pr, pf, n, null from (values
    (1,  'Pedicures',    'Regular spa pedicure',                 45, 3800, false),
    (2,  'Pedicures',    'Deluxe spa pedicure',                  50, 4800, false),
    (3,  'Pedicures',    'Super deluxe spa pedicure',            60, 5800, false),
    (4,  'Pedicures',    'Collagen spa pedicure',                60, 6800, false),
    (5,  'Pedicures',    'Organic spa pedicure',                 75, 8500, false),
    (6,  'Manicures',    'Regular manicure',                     30, 3000, false),
    (7,  'Manicures',    'Regular manicure & regular pedicure',  75, 6500, false),
    (8,  'Gel color',    'Gel color change - hands',             30, 3000, false),
    (9,  'Gel color',    'Gel color change - toes',              30, 3500, false),
    (10, 'Gel color',    'Gel color manicure',                   45, 4500, false),
    (11, 'Gel color',    'Gel color pedicure',                   60, 5300, false),
    (12, 'Gel color',    'Gel manicure & regular pedicure',      90, 8300, false),
    (13, 'Gel color',    'Gel manicure & gel pedicure',         100, 9800, false),
    (14, 'Gel color',    'Regular manicure & gel pedicure',      90, 8300, false),
    (15, 'Add-ons',      'French tip',                           10,  700, false),
    (16, 'Add-ons',      'Polish change - hands',                15, 1700, false),
    (17, 'Add-ons',      'Polish change - toes',                 15, 2000, false),
    (18, 'Enhancements', 'Acrylic full set',                     75, 4800, false),
    (19, 'Enhancements', 'Acrylic fill-in',                      45, 3800, false),
    (20, 'Enhancements', 'Acrylic with gel color - full set',    90, 5800, false),
    (21, 'Enhancements', 'Acrylic with gel color - fill-in',     60, 4800, false),
    (22, 'Enhancements', 'White tip - full set',                 90, 5800, false),
    (23, 'Enhancements', 'Pink and white - full set',            90, 7000, false),
    (24, 'Enhancements', 'Pink and white - fill-in',             60, 6500, false),
    (25, 'Enhancements', 'Builder gel',                          75, 6800, false),
    (26, 'Enhancements', 'Tap gel',                              75, 6800, false),
    (27, 'Dipping',      'Dipping powder - no tips',             60, 4800, false),
    (28, 'Dipping',      'Dipping powder with tips',             75, 5800, false),
    (29, 'Dipping',      'Dipping powder pink and white',        75, 5500, false),
    (30, 'Waxing',       'Eyebrows',                             15, 1200, false),
    (31, 'Waxing',       'Lip',                                  10, 1000, false),
    (32, 'Waxing',       'Chin',                                 10, 1200, true),
    (33, 'Waxing',       'Full face',                            30, 4500, true),
    (34, 'Waxing',       'Underarms',                            15, 2500, false),
    (35, 'Waxing',       'Full legs',                            45, 7500, true),
    (36, 'Waxing',       'Brazilian',                            30, 7500, true),
    (37, 'Waxing',       'Tinting',                              20, 3500, false)
  ) v(n, c, nm, mi, pr, pf)
  on conflict (id) do update set category = excluded.category, name = excluded.name, minutes = excluded.minutes,
    price_cents = excluded.price_cents, price_from = excluded.price_from, sort = excluded.sort, archived_at = null;

  -- Loyalty on: 1 point per $1, 300 points = $10 off.
  insert into public.loyalty_settings (salon_id, on_, kind, points_per_dollar, reward_points, reward_cents)
  values (sid, true, 'points', 1, 300, 1000)
  on conflict (salon_id) do update set on_ = true, kind = 'points', points_per_dollar = 1, reward_points = 300, reward_cents = 1000;

  -- Platform admin: the test admin phone, once it has signed in at least once (auth user exists).
  insert into public.platform_admins (auth_user_id, note)
  select u.id, 'Test Admin (test phone +15550100009)' from auth.users u where u.phone = '15550100009'
  on conflict (auth_user_id) do nothing;
end $$;
