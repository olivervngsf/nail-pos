-- Proof of consent for client texts: every yes / no is recorded with where, the words, who and when; only the
-- server can read "may I text?" and record STOP/START replies; the desk can read a client's history. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fd01', '14085550911', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon, service_role;
create temp view t_day as select (now() at time zone 'America/Los_Angeles')::date + 3 as d;
create function pg_temp.bk(p_start int, p_extra jsonb) returns jsonb language sql as $$
  select public.book_create(jsonb_build_object('slug', 'consent-test', 'day', (select d from t_day), 'start', p_start,
    'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000041c1')))) || p_extra) $$;
grant select on t_day to anon, authenticated, service_role;
insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000041a1', 'ownerName', 'Mai', 'salonName', 'Consent Test Nails', 'state', 'CA', 'step', 9,
  'hours', (select jsonb_agg(jsonb_build_object('on', true, 'open', '09:00', 'close', '19:00')) from generate_series(1, 7)),
  'services', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000041c1', 'cat', 'Hands', 'name', 'Gel manicure', 'minutes', 45, 'priceCents', 4500, 'on', true)),
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000417a', 'name', 'Kim', 'phone', '+14085550912', 'role', 'tech'))));
select public.booking_settings_save('00000000-0000-0000-0000-0000000041a1', '{"slug": "consent-test"}');
-- Desk adds a client who said yes at the front desk.
insert into t_out values ('desk_id', to_jsonb(public.client_save(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000041a1',
  'name', 'Desk Yes', 'phone', '+15550109001', 'textsOk', true, 'consentText', 'Client agreed to get texts'))));

-- Booking page: yes with the words shown; a second booking that changes nothing adds no row; no yes = no row.
reset role; set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1","user-agent":"TestPhone"}', true);
insert into t_out values ('b1', pg_temp.bk(600, '{"name": "Page Yes", "phone": "+15550109002", "textsOk": true, "consentText": "Text me a confirmation + reminder. Reply STOP anytime."}'));
insert into t_out values ('b2', pg_temp.bk(720, '{"name": "Page Yes", "phone": "+15550109002", "textsOk": true}'));
insert into t_out values ('b3', pg_temp.bk(840, '{"name": "Page No", "phone": "+15550109003"}'));
do $$ begin perform public.consent_ok('00000000-0000-0000-0000-0000000041a1', '+15550109002'); raise exception 'FAIL: anon asked consent_ok'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.consent_text_reply('00000000-0000-0000-0000-0000000041a1', '+15550109002', true, 'STOP'); raise exception 'FAIL: anon recorded STOP'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.client_consent((select (v #>> '{}')::uuid from t_out where k = 'desk_id')); raise exception 'FAIL: anon read consent'; exception when insufficient_privilege then null; end $$;

-- Server: may I text? then STOP and START replies.
reset role; set local role service_role;
insert into t_out values ('ok_before', to_jsonb(public.consent_ok('00000000-0000-0000-0000-0000000041a1', '+15550109002')));
insert into t_out values ('ok_none', to_jsonb(public.consent_ok('00000000-0000-0000-0000-0000000041a1', '+15550109003')));
select public.consent_text_reply('00000000-0000-0000-0000-0000000041a1', '+15550109002', true, 'STOP');
insert into t_out values ('ok_stop', to_jsonb(public.consent_ok('00000000-0000-0000-0000-0000000041a1', '+15550109002')));
select public.consent_text_reply('00000000-0000-0000-0000-0000000041a1', '+15550109002', false, 'START');
insert into t_out values ('ok_start', to_jsonb(public.consent_ok('00000000-0000-0000-0000-0000000041a1', '+15550109002')));

-- A yes set some other way (no source given) is still recorded, marked unknown.
reset role;
select set_config('nailpos.consent_source', '', true), set_config('nailpos.consent_words', '', true), set_config('request.headers', '', true);
update public.clients set texts_ok = true where salon_id = '00000000-0000-0000-0000-0000000041a1' and phone = '+15550109003';
insert into t_out values ('rows', (select jsonb_agg(jsonb_build_object('p', phone, 's', said, 'src', source, 'w', words, 'ip', ip, 'ua', user_agent, 'by', by_person is not null) order by at)
  from public.text_consents where salon_id = '00000000-0000-0000-0000-0000000041a1'));

-- Desk reads a client's history.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
insert into t_out values ('hist', public.client_consent((select id from public.clients where salon_id = '00000000-0000-0000-0000-0000000041a1' and phone = '+15550109002')));
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if (o->'b1'->>'ok')::boolean is not true or (o->'b2'->>'ok')::boolean is not true or (o->'b3'->>'ok')::boolean is not true then raise exception 'FAIL bookings: %', o; end if;
  if o->'ok_before' <> 'true' or o->'ok_none' <> 'false' or o->'ok_stop' <> 'false' or o->'ok_start' <> 'true' then
    raise exception 'FAIL consent_ok: % % % %', o->'ok_before', o->'ok_none', o->'ok_stop', o->'ok_start'; end if;
  -- desk yes (by someone) · page yes with words, IP + phone browser · STOP · START · the unknown-source yes
  if o->'rows' <> '[{"p":"+15550109001","s":"yes","w":"Client agreed to get texts","by":true,"ip":"","ua":null,"src":"desk"},{"p":"+15550109002","s":"yes","w":"Text me a confirmation + reminder. Reply STOP anytime.","by":false,"ip":"203.0.113.7","ua":"TestPhone","src":"booking_page:web"},{"p":"+15550109002","s":"no","w":"STOP","by":false,"ip":"203.0.113.7","ua":"TestPhone","src":"text_reply"},{"p":"+15550109002","s":"yes","w":"START","by":false,"ip":"203.0.113.7","ua":"TestPhone","src":"text_reply"},{"p":"+15550109003","s":"yes","w":null,"by":false,"ip":"","ua":null,"src":"unknown"}]'::jsonb
    then raise exception 'FAIL rows: %', o->'rows'; end if;
  if jsonb_array_length(o->'hist') <> 3 or o->'hist'->0->>'said' <> 'yes' or o->'hist'->0->>'source' <> 'text_reply' or o->'hist'->2->>'source' <> 'booking_page:web' then
    raise exception 'FAIL history: %', o->'hist'; end if;
  raise notice 'PASS text_consent';
end $$;
select 'PASS' as result;
rollback;
