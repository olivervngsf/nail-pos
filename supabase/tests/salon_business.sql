-- Business details: owner saves (EIN kept apart, only last 4 back), manager reads but can't save, other salons and
-- direct table reads see nothing, missing list goes empty once filled + confirmed. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fe01', '14085550921', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fe02', '14085550922', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fe03', '14085550923', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon, service_role;
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-00000000fe01'), ('00000000-0000-0000-0000-00000000fe03') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000042a1', 'ownerName', 'Mai', 'salonName', 'Biz Test Nails', 'state', 'CA', 'step', 9,
  'address', '1550 S Bascom Ave, Campbell, CA 95008', 'salonPhone', '+14085550100',
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000427a', 'name', 'Lan', 'phone', '+14085550922', 'role', 'manager'))));
insert into t_out values ('empty', public.business_get('00000000-0000-0000-0000-0000000042a1'));
do $$ begin perform public.business_save('00000000-0000-0000-0000-0000000042a1', '{"ein":"1234"}'); raise exception 'FAIL short EIN saved'; exception when sqlstate '22023' then null; end $$;
insert into t_out values ('saved', public.business_save('00000000-0000-0000-0000-0000000042a1',
  '{"legalName":"Biz Test Nails LLC","businessType":"llc","ein":"12-3456789","areaCode":"408","consentMethod":"booking_page","promosOk":true,"confirm":true}'));
insert into t_out values ('again', public.business_save('00000000-0000-0000-0000-0000000042a1',
  '{"legalName":"Biz Test Nails LLC","businessType":"llc","areaCode":"408","consentMethod":"booking_page","confirm":false}'));
do $$ begin perform 1 from public.salon_business_secret; if found then raise exception 'FAIL owner reads EIN table'; end if; end $$;
-- the manager joins and reads, but can't save
reset role;
update public.memberships set person_id = (select id from public.people where auth_user_id = '00000000-0000-0000-0000-00000000fe02')
  where id = '00000000-0000-0000-0000-00000000427a' and exists (select 1 from public.people where auth_user_id = '00000000-0000-0000-0000-00000000fe02');
insert into public.people (auth_user_id, name, phone) select '00000000-0000-0000-0000-00000000fe02', 'Lan', '+14085550922'
  where not exists (select 1 from public.people where auth_user_id = '00000000-0000-0000-0000-00000000fe02');
update public.memberships set person_id = (select id from public.people where auth_user_id = '00000000-0000-0000-0000-00000000fe02')
  where id = '00000000-0000-0000-0000-00000000427a';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe02","role":"authenticated"}', true);
insert into t_out values ('manager', public.business_get('00000000-0000-0000-0000-0000000042a1'));
do $$ begin perform public.business_save('00000000-0000-0000-0000-0000000042a1', '{"legalName":"X"}'); raise exception 'FAIL manager saved'; exception when insufficient_privilege then null; end $$;
-- someone from another salon sees nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe03","role":"authenticated"}', true);
do $$ begin perform public.business_get('00000000-0000-0000-0000-0000000042a1'); raise exception 'FAIL stranger read'; exception when insufficient_privilege then null; end $$;
reset role;
insert into t_out values ('secret', (select jsonb_build_object('ein', ein) from public.salon_business_secret where salon_id = '00000000-0000-0000-0000-0000000042a1'));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->'empty'->'missing' <> '["legal_name","business_type","ein","area_code","consent_method","confirm"]'::jsonb then raise exception 'FAIL empty missing: %', o->'empty'->'missing'; end if;
  if (o->'empty'->>'canEdit')::boolean is not true then raise exception 'FAIL owner canEdit'; end if;
  if o->'saved'->'missing' <> '[]'::jsonb or o->'saved'->>'einLast4' <> '6789' or o->'saved' ? 'ein' then raise exception 'FAIL saved: %', o->'saved'; end if;
  if o->'again'->>'einLast4' <> '6789' or o->'again'->'missing' <> '["confirm"]'::jsonb then raise exception 'FAIL EIN kept / confirm undone: %', o->'again'; end if;
  if (o->'manager'->>'canEdit')::boolean or o->'manager'->>'legalName' <> 'Biz Test Nails LLC' then raise exception 'FAIL manager read: %', o->'manager'; end if;
  if o->'secret'->>'ein' <> '123456789' then raise exception 'FAIL secret: %', o->'secret'; end if;
  raise notice 'PASS salon_business';
end $$;
select 'PASS' as result;
rollback;
