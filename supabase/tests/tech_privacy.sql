-- Techs see only their part: desk calendar list = own bookings, no client phones; client list / profile = last 4 only;
-- no direct read of clients or other techs' bookings. Owner keeps the full view. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fa01', '14085550701', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fa02', '14085550702', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
create function pg_temp.bk(id text, staff text) returns jsonb language sql as $$
  select public.appt_save(jsonb_build_object('id', ('00000000-0000-0000-0000-0000000060' || id)::uuid, 'salonId', '00000000-0000-0000-0000-0000000060a1',
    'start', now() + interval '1 day', 'end', now() + interval '1 day 45 minutes', 'staffId', staff,
    'client', jsonb_build_object('phone', '+14085550142', 'name', 'Lan Tran'),
    'services', jsonb_build_array(jsonb_build_object('name', 'Gel manicure', 'minutes', 45, 'cents', 4500)), 'source', 'phone')) $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fa01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000060a1', 'ownerName', 'Mai', 'salonName', 'Privacy Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000607f', 'name', 'Kim', 'phone', '+14085550702', 'role', 'tech'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000608f', 'name', 'Lin', 'phone', '+14085550703', 'role', 'tech'))));
select pg_temp.bk('b1', '00000000-0000-0000-0000-00000000607f');  -- Kim's
select pg_temp.bk('b2', '00000000-0000-0000-0000-00000000608f');  -- Lin's
insert into t_out values ('owner_list', public.appt_list('00000000-0000-0000-0000-0000000060a1', now(), now() + interval '7 days'));
insert into t_out values ('owner_clients', public.client_list('00000000-0000-0000-0000-0000000060a1'));

-- Kim (tech, own login)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fa02","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('tech_list', public.appt_list('00000000-0000-0000-0000-0000000060a1', now(), now() + interval '7 days'));
insert into t_out values ('tech_clients', public.client_list('00000000-0000-0000-0000-0000000060a1'));
insert into t_out values ('tech_search', public.client_list('00000000-0000-0000-0000-0000000060a1', 'all', '555014'));
insert into t_out values ('tech_last4', public.client_list('00000000-0000-0000-0000-0000000060a1', 'all', '0142'));
insert into t_out select 'tech_profile', public.client_profile((e->>'id')::uuid) from jsonb_array_elements((select v->'rows' from t_out where k = 'tech_clients')) e limit 1;
insert into t_out values ('tech_tables', jsonb_build_array((select count(*) from public.clients),
  (select count(*) from public.appointments where staff_id <> '00000000-0000-0000-0000-00000000607f'),
  (select count(*) from public.appointments where staff_id = '00000000-0000-0000-0000-00000000607f')));
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if jsonb_array_length(o->'owner_list') <> 2 or o->'owner_list'->0->'client'->>'phone' <> '+14085550142' then raise exception 'FAIL owner list: %', o->'owner_list'; end if;
  if o->'owner_clients'->'rows'->0->>'phone' <> '+14085550142' then raise exception 'FAIL owner phone: %', o->'owner_clients'; end if;
  if jsonb_array_length(o->'tech_list') <> 1 or o->'tech_list'->0->>'staffId' <> '00000000-0000-0000-0000-00000000607f'
     or o->'tech_list'->0->'client'->>'phone' <> '' then raise exception 'FAIL tech list: %', o->'tech_list'; end if;
  if o->'tech_clients'->'rows'->0->>'phone' <> '••0142' then raise exception 'FAIL tech list phone: %', o->'tech_clients'; end if;
  if o->'tech_profile'->>'phone' <> '••0142' then raise exception 'FAIL tech profile phone: %', o->'tech_profile'->>'phone'; end if;
  if jsonb_array_length(o->'tech_search'->'rows') <> 0 then raise exception 'FAIL tech phone search: %', o->'tech_search'; end if;
  if jsonb_array_length(o->'tech_last4'->'rows') <> 1 then raise exception 'FAIL tech last-4 search: %', o->'tech_last4'; end if;
  if o->'tech_tables' <> '[0, 0, 1]'::jsonb then raise exception 'FAIL tech tables: %', o->'tech_tables'; end if;
  raise notice 'PASS tech_privacy';
end $$;
rollback;
