-- Session 7 (M8) booking page in SQL: slug from the name, public page shows only bookable things, free times,
-- book as a stranger (no sign-in) → on the calendar with its source, the same time can't be booked twice,
-- "anyone" picks a free tech, groups, kiosk (returning client hello, check-in = kiosk booking), tech books only own free time,
-- owner settings + slug rules, another salon sees nothing. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fe01', '14085550701', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fe02', '14085550702', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fe03', '14085550703', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only: test owners set up salons as platform admins
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}', true);
-- open every day 9–19
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000020a1', 'ownerName', 'Mai', 'salonName', 'Lotus Nails & Spa', 'state', 'CA', 'step', 9,
  'hours', (select jsonb_agg(jsonb_build_object('on', true, 'open', '09:00', 'close', '19:00')) from generate_series(1, 7)),
  'services', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000020c1', 'cat', 'Hands', 'name', 'Gel manicure', 'minutes', 45, 'priceCents', 4500, 'on', true),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000020c2', 'cat', 'Feet', 'name', 'Spa pedicure', 'minutes', 60, 'priceCents', 3500, 'on', true)),
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000207a', 'name', 'Kim', 'phone', '+14085550702', 'role', 'tech'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000207b', 'name', 'Tuyet', 'phone', '+14085550704', 'role', 'tech'))));
insert into t_out values ('slug', to_jsonb((select slug from public.salons where id = '00000000-0000-0000-0000-0000000020a1')));
-- owner hides pedicure from the page; bad / reserved / good slug
select public.service_online('00000000-0000-0000-0000-0000000020c2', false);
select public.salon_photo_add('00000000-0000-0000-0000-0000000020f1', '00000000-0000-0000-0000-0000000020a1', '00000000-0000-0000-0000-0000000020a1/front.jpg', 'Salon');
select public.salon_photo_add('00000000-0000-0000-0000-0000000020f2', '00000000-0000-0000-0000-0000000020a1', '00000000-0000-0000-0000-0000000020a1/art.jpg', 'Gel art');
select public.salon_photo_cover('00000000-0000-0000-0000-0000000020f2');
do $$ begin perform public.salon_photo_add(gen_random_uuid(), '00000000-0000-0000-0000-0000000020a1', 'other/x.jpg', '');
  raise exception 'FAIL: photo outside salon folder'; exception when others then if sqlerrm not like '%bad photo path%' then raise; end if; end $$;
insert into t_out values ('slug_bad', public.booking_settings_save('00000000-0000-0000-0000-0000000020a1', '{"slug": "Lo tus!"}'));
insert into t_out values ('slug_reserved', public.booking_settings_save('00000000-0000-0000-0000-0000000020a1', '{"slug": "checkout"}'));
insert into t_out values ('slug_ok', public.booking_settings_save('00000000-0000-0000-0000-0000000020a1', '{"slug": "lotus", "group_max": 2}'));
-- a save only changes what was sent: slug only / on only / one number / a null keep the other rules
insert into t_out values ('rules_before', (select booking_settings from public.salons where id = '00000000-0000-0000-0000-0000000020a1'));
select public.booking_settings_save('00000000-0000-0000-0000-0000000020a1', '{"slug": "lotus"}');
select public.booking_settings_save('00000000-0000-0000-0000-0000000020a1', '{"on": true}');
select public.booking_settings_save('00000000-0000-0000-0000-0000000020a1', '{"days_ahead": null}');
insert into t_out values ('rules_after', (select booking_settings from public.salons where id = '00000000-0000-0000-0000-0000000020a1'));
select public.booking_settings_save('00000000-0000-0000-0000-0000000020a1', '{"cancel_hours": 99}');
insert into t_out values ('rules_one', (select booking_settings from public.salons where id = '00000000-0000-0000-0000-0000000020a1'));
select public.booking_settings_save('00000000-0000-0000-0000-0000000020a1', '{"cancel_hours": 2}');
-- name change no longer moves a chosen slug
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000020a1', 'salonName', 'Lotus Two'));
-- a desk booking: Kim 10:00–11:00 tomorrow
select public.appt_save(jsonb_build_object('id', '00000000-0000-0000-0000-0000000020d1', 'salonId', '00000000-0000-0000-0000-0000000020a1',
  'start', ((now() at time zone 'America/Los_Angeles')::date + 1 + time '10:00') at time zone 'America/Los_Angeles',
  'end', ((now() at time zone 'America/Los_Angeles')::date + 1 + time '11:00') at time zone 'America/Los_Angeles',
  'staffId', '00000000-0000-0000-0000-00000000207a', 'services', '[]', 'source', 'phone'));

-- a stranger, not signed in
reset role; set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into t_out values ('page', public.book_page('lotus'));
insert into t_out values ('no_page', to_jsonb(public.book_page('nope') is null));
insert into t_out values ('slots_kim', public.book_slots('lotus', (now() at time zone 'America/Los_Angeles')::date + 1, '00000000-0000-0000-0000-00000000207a', 45));
insert into t_out values ('slots_any', public.book_slots('lotus', (now() at time zone 'America/Los_Angeles')::date + 1, null, 45));
insert into t_out values ('too_far', public.book_slots('lotus', (now() at time zone 'America/Los_Angeles')::date + 60, null, 45));
-- book Kim 11:00 tomorrow, then someone else tries the same Kim 11:00 → taken; "anyone" at 11:00 → Tuyet
insert into t_out values ('b1', public.book_create(jsonb_build_object('slug', 'lotus', 'src', 'instagram', 'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 660,
  'phone', '+14085550142', 'name', 'Lan Tran', 'textsOk', true,
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1'), 'staffId', '00000000-0000-0000-0000-00000000207a')))));
insert into t_out values ('b1_again', public.book_create(jsonb_build_object('slug', 'lotus', 'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 660,
  'phone', '+14085550131', 'name', 'Jen Park',
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1'), 'staffId', '00000000-0000-0000-0000-00000000207a')))));
insert into t_out values ('b_any', public.book_create(jsonb_build_object('slug', 'lotus', 'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 660,
  'phone', '+14085550131', 'name', 'Jen Park',
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1'))))));
-- group of 2 at 11:00: nobody left → taken, nothing half-booked
insert into t_out values ('group_full', public.book_create(jsonb_build_object('slug', 'lotus', 'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 660,
  'phone', '+14085550155', 'name', 'Sara Lopez',
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1')), jsonb_build_object('name', 'Ana', 'serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1'))))));
-- group of 2 at 14:00 → both techs
insert into t_out values ('group', public.book_create(jsonb_build_object('slug', 'lotus', 'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 840,
  'phone', '+14085550155', 'name', 'Sara Lopez',
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1')), jsonb_build_object('name', 'Ana', 'serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1'))))));
-- group of 3 > group_max 2; hidden service; inside a desk booking
insert into t_out values ('group_big', public.book_create(jsonb_build_object('slug', 'lotus', 'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 900, 'phone', '+14085550155', 'name', 'Sara',
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1')), jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1')), jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1'))))));
insert into t_out values ('hidden', public.book_create(jsonb_build_object('slug', 'lotus', 'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 900, 'phone', '+14085550155', 'name', 'Sara',
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c2'))))));
insert into t_out values ('on_desk', public.book_create(jsonb_build_object('slug', 'lotus', 'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 615, 'phone', '+14085550155', 'name', 'Sara',
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1'), 'staffId', '00000000-0000-0000-0000-00000000207a')))));
insert into t_out values ('hello', public.book_hello('lotus', '+14085550142'));
do $$ begin perform public.appt_list('00000000-0000-0000-0000-0000000020a1', now(), now() + interval '3 days');
  raise exception 'FAIL: anon read calendar'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.kiosk_hello('00000000-0000-0000-0000-0000000020a1', '+14085550142');
  raise exception 'FAIL: anon kiosk'; exception when insufficient_privilege then null; end $$;
reset role; set local role authenticated;

-- kiosk on the salon device (owner signed in): returning client → first name + last services; check-in saved as a kiosk booking
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}', true);
insert into t_out values ('k_hello', public.kiosk_hello('00000000-0000-0000-0000-0000000020a1', '+14085550142'));
insert into t_out values ('k_walk', public.appt_save(jsonb_build_object('id', '00000000-0000-0000-0000-0000000020d3', 'salonId', '00000000-0000-0000-0000-0000000020a1',
  'start', now(), 'end', now() + interval '45 minutes', 'client', jsonb_build_object('phone', '+14085550121', 'name', 'Rosa Diaz'),
  'services', '[]', 'source', 'kiosk', 'note', 'B1')));

-- Kim on her phone: own free times only; can't book into her 10:00 desk booking; books 16:00
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe02","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('my_slots', public.my_slots('00000000-0000-0000-0000-0000000020a1', (now() at time zone 'America/Los_Angeles')::date + 1, 45));
insert into t_out values ('s_taken', public.staff_book(jsonb_build_object('id', '00000000-0000-0000-0000-0000000020e1', 'salonId', '00000000-0000-0000-0000-0000000020a1',
  'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 615, 'phone', '+14085550199', 'name', 'Vy', 'serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1'))));
insert into t_out values ('s_ok', public.staff_book(jsonb_build_object('id', '00000000-0000-0000-0000-0000000020e2', 'salonId', '00000000-0000-0000-0000-0000000020a1',
  'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 960, 'phone', '+14085550199', 'name', 'Vy', 'serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1'))));
insert into t_out values ('s_again', public.staff_book(jsonb_build_object('id', '00000000-0000-0000-0000-0000000020e2', 'salonId', '00000000-0000-0000-0000-0000000020a1',
  'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 960, 'phone', '+14085550199', 'name', 'Vy', 'serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000020c1'))));
select public.staff_unbook('00000000-0000-0000-0000-0000000020e2');
insert into t_out values ('unbook', 'true');
do $$ begin perform public.staff_unbook('00000000-0000-0000-0000-0000000020d1');
  raise exception 'FAIL: tech undid a desk booking'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
do $$ begin perform public.booking_settings_save('00000000-0000-0000-0000-0000000020a1', '{"slug": "kimnails"}');
  raise exception 'FAIL: tech changed settings'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
insert into t_out values ('k_tech', coalesce(public.kiosk_hello('00000000-0000-0000-0000-0000000020a1', '+14085550142'), 'null'));
-- stranger signed in: nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe03","role":"authenticated"}', true);
do $$ begin perform public.my_slots('00000000-0000-0000-0000-0000000020a1', current_date + 1, 45);
  raise exception 'FAIL: stranger slots'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
insert into t_out values ('stranger_get', to_jsonb(public.booking_settings_get('00000000-0000-0000-0000-0000000020a1') is null));
insert into t_out values ('stranger', to_jsonb((select count(*) from public.salon_photos) + (select count(*) from public.appointments)));
reset role;
insert into t_out values ('rows', (select jsonb_agg(jsonb_build_object('src', source, 'staff', staff_id, 'min', extract(hour from start_at at time zone 'America/Los_Angeles') * 60 + extract(minute from start_at at time zone 'America/Los_Angeles'), 'status', status, 'party', party_id is not null, 'name', client_name) order by created_at, client_name)
  from public.appointments where salon_id = '00000000-0000-0000-0000-0000000020a1'));
insert into t_out values ('rem', to_jsonb((select count(*) from public.reminders r join public.appointments a on a.id = r.appointment_id where a.source = 'instagram')));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->>'slug' <> 'lotus-nails-spa' then raise exception 'FAIL slug from name: %', o->'slug'; end if;
  if o->'slug_bad'->>'reason' <> 'slug_bad' or o->'slug_reserved'->>'reason' <> 'slug_taken' or o->'slug_ok'->>'slug' <> 'lotus' then raise exception 'FAIL slug rules: % % %', o->'slug_bad', o->'slug_reserved', o->'slug_ok'; end if;
  if o->'rules_after' <> o->'rules_before' or (o->'rules_before'->>'group_max')::int <> 2 or (o->'rules_before'->>'days_ahead')::int <> 30
     or (o->'rules_one'->>'cancel_hours')::int <> 48 or (o->'rules_one') - 'cancel_hours' <> (o->'rules_before') - 'cancel_hours'
     then raise exception 'FAIL partial save: % % %', o->'rules_before', o->'rules_after', o->'rules_one'; end if;
  if jsonb_array_length(o->'page'->'services') <> 1 or jsonb_array_length(o->'page'->'staff') <> 2 or o->'page'->'salon'->>'name' <> 'Lotus Two'
     or (o->'page') ? 'clients' or (o->'page'->'staff'->0) ? 'phone' then raise exception 'FAIL page: %', o->'page'; end if;
  if (o->>'no_page')::boolean is not true then raise exception 'FAIL unknown slug'; end if;
  -- Kim busy 10:00–11:00: 45-min starts 9:15..9:45 can't, 10:00..10:45 can't
  if (o->'slots_kim') @> '[600]' or (o->'slots_kim') @> '[570]' or not (o->'slots_kim') @> '[540, 660]' then raise exception 'FAIL kim slots: %', o->'slots_kim'; end if;
  if not (o->'slots_any') @> '[600]' then raise exception 'FAIL anyone slots: %', o->'slots_any'; end if;
  if jsonb_array_length(o->'too_far') <> 0 then raise exception 'FAIL days ahead'; end if;
  if (o->'b1'->>'ok')::boolean is not true or o->'b1_again'->>'reason' <> 'taken' then raise exception 'FAIL double booking: % %', o->'b1', o->'b1_again'; end if;
  if (o->'b_any'->>'ok')::boolean is not true or o->'b_any'->'staff'->>0 <> 'Tuyet' then raise exception 'FAIL anyone: %', o->'b_any'; end if;
  if o->'group_full'->>'reason' <> 'taken' then raise exception 'FAIL group full: %', o->'group_full'; end if;
  if jsonb_array_length(o->'group'->'staff') <> 2 then raise exception 'FAIL group: %', o->'group'; end if;
  if o->'group_big'->>'reason' <> 'bad' or o->'hidden'->>'reason' <> 'bad' or o->'on_desk'->>'reason' <> 'taken' then raise exception 'FAIL limits: % % %', o->'group_big', o->'hidden', o->'on_desk'; end if;
  if o->'hello'->>'first' <> 'Lan' or (o->'hello') ? 'last' then raise exception 'FAIL hello: %', o->'hello'; end if;
  if o->'k_hello'->>'first' <> 'Lan' or o->'k_tech' <> 'null'::jsonb or (o->'k_walk') ? 'stale' then raise exception 'FAIL kiosk: % % %', o->'k_hello', o->'k_tech', o->'k_walk'; end if;
  if (o->'my_slots') @> '[600]' or (o->'my_slots') @> '[660]' or not (o->'my_slots') @> '[960]' then raise exception 'FAIL my slots: %', o->'my_slots'; end if;
  if o->'s_taken'->>'reason' <> 'taken' or (o->'s_ok'->>'ok')::boolean is not true or (o->'s_again'->>'repeat')::boolean is not true then raise exception 'FAIL staff book: % % %', o->'s_taken', o->'s_ok', o->'s_again'; end if;
  if o->'page'->'photos'->0->>'label' <> 'Gel art' or jsonb_array_length(o->'page'->'photos') <> 2 then raise exception 'FAIL photos: %', o->'page'->'photos'; end if;
  if (o->>'unbook')::boolean is not true or (o->>'stranger_get')::boolean is not true then raise exception 'FAIL unbook/get'; end if;
  if (o->>'stranger')::int <> 0 then raise exception 'FAIL wall: %', o->'stranger'; end if;
  if (select count(*) from jsonb_array_elements(o->'rows') r where r->>'src' = 'instagram' and (r->>'min')::int = 660) <> 1
     or (select count(*) from jsonb_array_elements(o->'rows') r where (r->>'party')::boolean) <> 2
     or (select count(*) from jsonb_array_elements(o->'rows') r where r->>'src' = 'kiosk') <> 1
     or (select count(*) from jsonb_array_elements(o->'rows') r where r->>'src' = 'staff_phone' and r->>'status' = 'canceled') <> 1
     then raise exception 'FAIL rows: %', o->'rows'; end if;
  if (o->>'rem')::int < 2 then raise exception 'FAIL reminders: %', o->'rem'; end if;
  raise notice 'PASS session7_booking_page';
end $$;
rollback;
