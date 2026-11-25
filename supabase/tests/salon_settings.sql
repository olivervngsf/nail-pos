-- Settings → Salon: the owner changes name, address, state, time zone, hours and the menu (all logged);
-- a tech can read but not change; bad hours / time zone refused; CA turns the tip card fee off. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fe01', '14085550831', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fe02', '14085550832', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v text);
grant all on t_out to authenticated, anon;
create function pg_temp.try(k text, q text) returns void language plpgsql as $$
declare r text;
begin
  execute q into r;
  insert into t_out values (k, coalesce(r, 'ok'));
exception when others then
  insert into t_out values (k, 'ERR ' || sqlerrm);
end $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.platform_admins (auth_user_id) select id from auth.users where id = '00000000-0000-0000-0000-00000000fe01' on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000073a1', 'ownerName', 'Mai', 'salonName', 'Home Nails', 'state', 'TX', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000737f', 'name', 'Kim', 'phone', '+14085550832', 'role', 'tech'))));

select pg_temp.try('save', $q$select public.salon_info_save('00000000-0000-0000-0000-0000000073a1', jsonb_build_object(
  'name', 'Lotus Nails', 'phone', '(408) 555-0100', 'address', '1 Main St, San Jose, CA 95112', 'state', 'ca', 'time_zone', 'America/Los_Angeles',
  'hours', (select jsonb_agg(jsonb_build_object('weekday', d, 'on', d <> 6, 'open', '09:30', 'close', '19:00')) from generate_series(0, 6) d)))->>'name'$q$);
select pg_temp.try('bad_hours', $q$select public.salon_info_save('00000000-0000-0000-0000-0000000073a1', jsonb_build_object(
  'name', 'X', 'state', 'CA', 'time_zone', 'America/Los_Angeles',
  'hours', (select jsonb_agg(jsonb_build_object('weekday', d, 'on', true, 'open', '19:00', 'close', '09:00')) from generate_series(0, 6) d)))::text$q$);
select pg_temp.try('bad_tz', $q$select public.salon_info_save('00000000-0000-0000-0000-0000000073a1', jsonb_build_object('name', 'X', 'state', 'CA', 'time_zone', 'Mars/Base'))::text$q$);
select pg_temp.try('add', $q$select public.menu_service_save('00000000-0000-0000-0000-0000000073a1', '{"cat":"Hands","name":"Jelly spa","minutes":45,"cents":3500}')::text$q$);
select pg_temp.try('dup', $q$select public.menu_service_save('00000000-0000-0000-0000-0000000073a1', '{"cat":"Hands","name":"jelly SPA","minutes":30,"cents":100}')::text$q$);
select pg_temp.try('edit', $q$select public.menu_service_save('00000000-0000-0000-0000-0000000073a1', jsonb_build_object('id', (select v from t_out where k = 'add'),
  'cat', 'Hands', 'name', 'Jelly spa deluxe', 'minutes', 50, 'cents', 4000, 'from', true))::text$q$);

-- Kim (tech, own login): reads, can't change
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe02","role":"authenticated"}', true);
select public.claim_memberships();
select pg_temp.try('tech_read', $q$select public.salon_info_get('00000000-0000-0000-0000-0000000073a1')->>'can_edit'$q$);
select pg_temp.try('tech_save', $q$select public.salon_info_save('00000000-0000-0000-0000-0000000073a1', '{"name":"Hacked","state":"CA","time_zone":"America/Los_Angeles"}')::text$q$);
select pg_temp.try('tech_menu', $q$select public.menu_service_save('00000000-0000-0000-0000-0000000073a1', '{"name":"Free","minutes":30,"cents":0}')::text$q$);

-- Owner removes the service
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}', true);
select pg_temp.try('remove', $q$select public.menu_service_remove('00000000-0000-0000-0000-0000000073a1', (select v from t_out where k = 'add')::uuid)::text$q$);
reset role;

do $$
declare sid uuid := '00000000-0000-0000-0000-0000000073a1';
begin
  if (select v from t_out where k = 'save') <> 'Lotus Nails' then raise exception 'FAIL save: %', (select v from t_out where k = 'save'); end if;
  if (select state || '|' || address || '|' || tip_fee_passthrough from public.salons where id = sid) <> 'CA|1 Main St, San Jose, CA 95112|false' then raise exception 'FAIL salon row'; end if;
  if (select count(*) from public.salon_hours where salon_id = sid and opens = '09:30') <> 6 or (select is_open from public.salon_hours where salon_id = sid and weekday = 6) then raise exception 'FAIL hours'; end if;
  if (select v from t_out where k = 'bad_hours') not like 'ERR%closing time%' then raise exception 'FAIL bad hours accepted: %', (select v from t_out where k = 'bad_hours'); end if;
  if (select v from t_out where k = 'bad_tz') not like 'ERR%time zone%' then raise exception 'FAIL bad time zone accepted'; end if;
  if (select v from t_out where k = 'dup') not like 'ERR%already on the menu%' then raise exception 'FAIL duplicate name accepted'; end if;
  if (select name || '|' || minutes || '|' || price_cents || '|' || price_from from public.services where id = (select v from t_out where k = 'add')::uuid) <> 'Jelly spa deluxe|50|4000|true' then raise exception 'FAIL edit'; end if;
  if (select v from t_out where k = 'tech_read') <> 'false' then raise exception 'FAIL tech read: %', (select v from t_out where k = 'tech_read'); end if;
  if (select v from t_out where k = 'tech_save') not like 'ERR%not allowed%' or (select v from t_out where k = 'tech_menu') not like 'ERR%not allowed%' then raise exception 'FAIL tech changed settings'; end if;
  if (select archived_at from public.services where id = (select v from t_out where k = 'add')::uuid) is null then raise exception 'FAIL remove'; end if;
  if (select count(*) from public.audit_log where salon_id = sid and action in ('salon.info_saved', 'service.saved', 'service.removed')) <> 4 then raise exception 'FAIL audit count'; end if;
  raise notice 'OK salon_settings';
end $$;
rollback;
