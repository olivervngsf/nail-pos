-- Session 5 (M6) clients in SQL: tags (regular / lost / new), filters, search by phone or name, profile facts,
-- desk saves details, a tech reads the same profile + adds a note and a photo, salon wall. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000ee01', '14085550501', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ee02', '14085550502', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ee03', '14085550503', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
create function pg_temp.visit(tid int, phone text, name text, cents int, days_ago int) returns void language plpgsql security definer as $$
declare vid uuid := ('00000000-0000-0000-0000-0000000009' || lpad(tid::text, 2, '0'))::uuid;
begin
  perform public.save_ticket(jsonb_build_object('id', vid, 'salonId', '00000000-0000-0000-0000-0000000009a1', 'client', jsonb_build_object('phone', phone, 'name', name),
    'lines', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'kind', 'service', 'staffId', '00000000-0000-0000-0000-00000000097f', 'name', 'Gel manicure', 'minutes', 45, 'cents', cents),
                               jsonb_build_object('id', gen_random_uuid(), 'kind', 'tip', 'staffId', '00000000-0000-0000-0000-00000000097f', 'name', 'Cash tip', 'cents', 500)),
    'payment', jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'givenCents', 100000)));
  update public.tickets set paid_at = now() - make_interval(days => days_ago), created_at = now() - make_interval(days => days_ago) where tickets.id = vid;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000009a1', 'ownerName', 'Mai', 'salonName', 'Client Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000097f', 'name', 'Kim', 'phone', '+14085550502', 'role', 'tech'))));
-- Lan: regular (every ~28 days, last 10 days ago). Jen: regular, last 90 days ago → lost. Mai: one visit today → new.
select pg_temp.visit(1, '+14085550142', 'Lan Tran', 3500, 66);
select pg_temp.visit(2, '+14085550142', 'Lan Tran', 4500, 38);
select pg_temp.visit(3, '+14085550142', 'Typo Name', 3500, 10);  -- a ticket never renames a client on file
select pg_temp.visit(4, '+14085550131', 'Jen Park', 3000, 150);
select pg_temp.visit(5, '+14085550131', 'Jen Park', 3000, 120);
select pg_temp.visit(6, '+14085550131', 'Jen Park', 5500, 90);
select pg_temp.visit(7, '+14085550170', 'Mai Pham', 6000, 0);
create temp table t_lan as select id from public.clients where phone = '+14085550142';
grant all on t_lan to authenticated;

insert into t_out values ('all', public.client_list('00000000-0000-0000-0000-0000000009a1', 'all', ''));
insert into t_out values ('lost', public.client_list('00000000-0000-0000-0000-0000000009a1', 'lost', ''));
insert into t_out values ('new', public.client_list('00000000-0000-0000-0000-0000000009a1', 'new', ''));
insert into t_out values ('by_phone', public.client_list('00000000-0000-0000-0000-0000000009a1', 'all', '(408) 555-0142'));
insert into t_out values ('by_name', public.client_list('00000000-0000-0000-0000-0000000009a1', 'all', 'jen'));
-- editing someone on file needs an owner/manager OK
do $$ begin perform public.client_save(jsonb_build_object('id', (select id from t_lan), 'salonId', '00000000-0000-0000-0000-0000000009a1', 'name', 'Renamed'));
  raise exception 'FAIL: edit without OK'; exception when others then if sqlerrm not like '%owner or manager OK%' then raise; end if; end $$;
-- owner OK (own login), then desk saves details (allergy, birthday this month, usual tech)
select set_config('t.ok', public.approve_discount('00000000-0000-0000-0000-0000000009a1', p_purpose => 'client')->>'approval_id', true);
select public.client_save(jsonb_build_object('id', (select id from t_lan), 'salonId', '00000000-0000-0000-0000-0000000009a1', 'care', 'Sensitive skin, no acetone soak',
  'shape', 'Almond · short', 'birthday', to_char(now(), 'YYYY-MM-') || '05', 'usualStaff', '00000000-0000-0000-0000-00000000097f', 'approvalId', current_setting('t.ok')));
-- the same OK can't be used twice
do $$ begin perform public.client_save(jsonb_build_object('id', (select id from t_lan), 'salonId', '00000000-0000-0000-0000-0000000009a1', 'name', 'Renamed',
  'approvalId', current_setting('t.ok')));
  raise exception 'FAIL: OK used twice'; exception when others then if sqlerrm not like '%owner or manager OK%' then raise; end if; end $$;
-- "new client" with a phone already on file is refused (no quiet rename)
do $$ begin perform public.client_save(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000009a1', 'name', 'Someone Else', 'phone', '+14085550142'));
  raise exception 'FAIL: duplicate phone added'; exception when others then if sqlerrm not like '%already a client%' then raise; end if; end $$;
insert into t_out values ('bday', public.client_list('00000000-0000-0000-0000-0000000009a1', 'bday', ''));
insert into t_out select 'profile', public.client_profile(id) from t_lan;
-- new client added at the desk
insert into t_out values ('added', to_jsonb(public.client_save(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000009a1', 'name', 'Anna Kim', 'phone', '+14085550199'))));

-- tech: same profile, adds a note + a photo; a photo path for another client is refused
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee02","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out select 'tech_profile', public.client_profile(id) from t_lan;
select public.client_add_note('00000000-0000-0000-0000-0000000009c1', id, '00000000-0000-0000-0000-000000000903', 'Skin a bit red at cuticles, gentle remover next time') from t_lan;
select public.client_add_note('00000000-0000-0000-0000-0000000009c1', id, null, 'same id again') from t_lan;
select public.client_add_photo('00000000-0000-0000-0000-0000000009d1', id, '00000000-0000-0000-0000-000000000903',
  '00000000-0000-0000-0000-0000000009a1/' || id || '/00000000-0000-0000-0000-0000000009d1.jpg') from t_lan;
do $$ begin perform public.client_add_photo(gen_random_uuid(), (select id from t_lan), null, 'other-salon/x.jpg');
  raise exception 'FAIL: bad path accepted'; exception when others then if sqlerrm not like '%bad photo path%' then raise; end if; end $$;
do $$ begin perform public.client_save(jsonb_build_object('id', (select id from t_lan), 'salonId', '00000000-0000-0000-0000-0000000009a1', 'care', 'x'));
  raise exception 'FAIL: tech edited client'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
insert into t_out select 'after_tech', public.client_profile(id) from t_lan;

-- stranger: nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee03","role":"authenticated"}', true);
do $$ begin perform public.client_list('00000000-0000-0000-0000-0000000009a1', 'all', '');
  raise exception 'FAIL: stranger listed clients'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
insert into t_out values ('stranger', (select to_jsonb((select count(*) from public.client_notes) + (select count(*) from public.client_photos))));
reset role;
insert into t_out values ('edits_logged', (select to_jsonb(count(*)) from public.audit_log where action = 'client.edited'));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if (o->'all'->'counts'->>'all')::int <> 3 or (o->'all'->'counts'->>'regular')::int <> 2 or (o->'all'->'counts'->>'lost')::int <> 1 or (o->'all'->'counts'->>'new')::int <> 1
    then raise exception 'FAIL counts: %', o->'all'->'counts'; end if;
  if jsonb_array_length(o->'lost'->'rows') <> 1 or o->'lost'->'rows'->0->>'name' <> 'Jen Park' then raise exception 'FAIL lost: %', o->'lost'; end if;
  if o->'new'->'rows'->0->>'name' <> 'Mai Pham' then raise exception 'FAIL new: %', o->'new'; end if;
  if jsonb_array_length(o->'by_phone'->'rows') <> 1 or o->'by_phone'->'rows'->0->>'name' <> 'Lan Tran' or o->'by_phone'->'rows'->0->>'tag' <> 'regular' then raise exception 'FAIL phone search: %', o->'by_phone'; end if;
  if jsonb_array_length(o->'by_name'->'rows') <> 1 then raise exception 'FAIL name search: %', o->'by_name'; end if;
  if jsonb_array_length(o->'bday'->'rows') <> 1 then raise exception 'FAIL bday: %', o->'bday'; end if;
  if (o->'profile'->'stats'->>'visits')::int <> 3 or (o->'profile'->'stats'->>'spent')::int <> 11500 or (o->'profile'->'stats'->>'avg')::int <> 3833
     or (o->'profile'->'stats'->>'gap_days')::numeric <> 28 or o->'profile'->>'usual_staff' <> 'Kim' or o->'profile'->>'usual_service' <> 'Gel manicure'
     or o->'profile'->>'care' <> 'Sensitive skin, no acetone soak' or jsonb_array_length(o->'profile'->'visits') <> 3 then raise exception 'FAIL profile: %', o->'profile'; end if;
  if o->'tech_profile'->'stats' <> o->'profile'->'stats' then raise exception 'FAIL tech sees different history'; end if;
  if jsonb_array_length(o->'after_tech'->'notes_log') <> 1 or o->'after_tech'->'notes_log'->0->>'by' <> 'Kim' or jsonb_array_length(o->'after_tech'->'photos') <> 1
    then raise exception 'FAIL tech note/photo: %', o->'after_tech'; end if;
  if o->>'added' is null then raise exception 'FAIL add client'; end if;
  if (o->>'stranger')::int <> 0 then raise exception 'FAIL salon wall'; end if;
  if (o->>'edits_logged')::int <> 1 then raise exception 'FAIL edit not logged: %', o->>'edits_logged'; end if;
  raise notice 'PASS session5_clients';
end $$;
rollback;
