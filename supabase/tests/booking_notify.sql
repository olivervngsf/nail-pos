-- Booking confirmations: phone, email or both (one required); one message row per way with where it goes;
-- only the server can claim them, each is handed out once; a moved booking moves its waiting reminders. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fc01', '14085550901', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon, service_role;
create temp view t_day as select (now() at time zone 'America/Los_Angeles')::date + 3 as d;
create function pg_temp.bk(p_start int, p_extra jsonb) returns jsonb language sql as $$
  select public.book_create(jsonb_build_object('slug', 'notify-test', 'day', (select d from t_day), 'start', p_start,
    'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000040c1')))) || p_extra) $$;
grant select on t_day to anon, authenticated, service_role;
insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000040a1', 'ownerName', 'Mai', 'salonName', 'Notify Test Nails', 'state', 'CA', 'step', 9,
  'hours', (select jsonb_agg(jsonb_build_object('on', true, 'open', '09:00', 'close', '19:00')) from generate_series(1, 7)),
  'services', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000040c1', 'cat', 'Hands', 'name', 'Gel manicure', 'minutes', 45, 'priceCents', 4500, 'on', true)),
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000407a', 'name', 'Kim', 'phone', '+14085550902', 'role', 'tech'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000407b', 'name', 'Tuyet', 'phone', '+14085550903', 'role', 'tech'))));
select public.booking_settings_save('00000000-0000-0000-0000-0000000040a1', '{"slug": "notify-test"}');

reset role; set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into t_out values ('none', pg_temp.bk(600, '{"name": "No Contact"}'));
insert into t_out values ('bad_email', pg_temp.bk(600, '{"name": "Bad", "email": "nope@x"}'));
insert into t_out values ('bad_phone', pg_temp.bk(600, '{"name": "Bad", "phone": "5551234", "email": "ok@example.com"}'));
insert into t_out values ('email', pg_temp.bk(600, '{"name": "Email Only", "email": "  Mia@Example.com ", "textsOk": true}'));
insert into t_out values ('both', pg_temp.bk(720, '{"name": "Both Ways", "phone": "+15550107777", "email": "both@example.com", "textsOk": true}'));
insert into t_out values ('phone', pg_temp.bk(840, '{"name": "Phone Only", "phone": "+15550108888"}'));
insert into t_out values ('again', pg_temp.bk(960, '{"name": "Mia Again", "email": "mia@example.com"}'));
do $$ begin perform public.booking_notice_claim('x'); raise exception 'FAIL: anon claimed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.booking_notice_done(1, 'sent', null); raise exception 'FAIL: anon marked sent'; exception when insufficient_privilege then null; end $$;

reset role;
insert into t_out values ('rows', (select jsonb_agg(jsonb_build_object('n', a.client_name, 'ch', r.channel, 'k', r.kind, 'to', r.to_addr) order by a.client_name, r.channel, r.kind)
  from public.reminders r join public.appointments a on a.id = r.appointment_id where a.salon_id = '00000000-0000-0000-0000-0000000040a1' and r.kind = 'confirm'));
insert into t_out values ('clients', (select jsonb_agg(jsonb_build_object('n', name, 'p', phone, 'e', email, 't', texts_ok) order by name) from public.clients where salon_id = '00000000-0000-0000-0000-0000000040a1'));
set local role service_role;
insert into t_out values ('claim', public.booking_notice_claim((select v->>'token' from t_out where k = 'both')));
insert into t_out values ('claim2', public.booking_notice_claim((select v->>'token' from t_out where k = 'both'))->'sends');
select public.booking_notice_done((x->>'id')::bigint, case x->>'channel' when 'email' then 'sent' else 'skipped' end, case x->>'channel' when 'sms' then 'salon texting not_started' end)
  from jsonb_array_elements((select v->'sends' from t_out where k = 'claim')) x;
reset role;
insert into t_out values ('after', (select jsonb_agg(jsonb_build_object('ch', r.channel, 'st', r.status, 'sent', r.sent_at is not null) order by r.channel)
  from public.reminders r where r.kind = 'confirm' and r.appointment_id = (select (v->'ids'->>0)::uuid from t_out where k = 'both')));
set local role anon;
insert into t_out values ('move', public.book_move((select v->>'token' from t_out where k = 'both'), (select d + 1 from t_day), 600));
reset role;
insert into t_out values ('moved', (select jsonb_agg(jsonb_build_object('ch', r.channel, 'k', r.kind, 'at', to_char(r.send_at at time zone 'America/Los_Angeles', 'HH24:MI')) order by r.channel, r.kind)
  from public.reminders r where r.status = 'queued' and r.appointment_id = (select (v->'ids'->>0)::uuid from t_out where k = 'both')));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->'none'->>'reason' <> 'bad' or o->'bad_email'->>'reason' <> 'bad' or o->'bad_phone'->>'reason' <> 'bad' then raise exception 'FAIL contact rules: % % %', o->'none', o->'bad_email', o->'bad_phone'; end if;
  if (o->'email'->>'ok')::boolean is not true or (o->'email'->>'notify')::boolean is not true or (o->'both'->>'notify')::boolean is not true
     or (o->'phone'->>'ok')::boolean is not true or (o->'phone'->>'notify')::boolean then raise exception 'FAIL booked: % % %', o->'email', o->'both', o->'phone'; end if;
  -- email only: one email row, no text even with textsOk; both: email + text; phone without yes: nothing
  if o->'rows' <> '[{"k":"confirm","n":"Both Ways","ch":"email","to":"both@example.com"},{"k":"confirm","n":"Both Ways","ch":"sms","to":"+15550107777"},{"k":"confirm","n":"Email Only","ch":"email","to":"mia@example.com"},{"k":"confirm","n":"Mia Again","ch":"email","to":"mia@example.com"}]'::jsonb
    then raise exception 'FAIL message rows: %', o->'rows'; end if;
  -- same email again = same client on file (not renamed), no second client
  if o->'clients' <> '[{"e":"both@example.com","n":"Both Ways","p":"+15550107777","t":true},{"e":"mia@example.com","n":"Email Only","p":null,"t":false},{"e":null,"n":"Phone Only","p":"+15550108888","t":false}]'::jsonb
    then raise exception 'FAIL clients: %', o->'clients'; end if;
  if jsonb_array_length(o->'claim'->'sends') <> 2 or jsonb_array_length(o->'claim2') <> 0 or o->'claim'->>'name' <> 'Both' or (o->'claim'->>'start')::int <> 720
     or o->'claim'->'salon'->>'texting' <> 'not_started' or o->'claim'->'guests'->0->>'staff' is null then raise exception 'FAIL claim: % %', o->'claim', o->'claim2'; end if;
  if o->'after' <> '[{"ch":"email","st":"sent","sent":true},{"ch":"sms","st":"skipped","sent":false}]'::jsonb then raise exception 'FAIL after send: %', o->'after'; end if;
  if (o->'move'->>'ok')::boolean is not true or o->'moved' <> '[{"k":"day_before","at":"10:00","ch":"email"},{"k":"two_hours","at":"08:00","ch":"email"},{"k":"day_before","at":"10:00","ch":"sms"},{"k":"two_hours","at":"08:00","ch":"sms"}]'::jsonb
    then raise exception 'FAIL reminders after move: % %', o->'move', o->'moved'; end if;
  raise notice 'PASS booking_notify';
end $$;
select 'PASS' as result;
rollback;
