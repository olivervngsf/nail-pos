-- Amenities (migration 20270130000001): owner saves the list, unknown keys dropped, list order kept, repeats removed,
-- other booking settings untouched, the public booking page returns it, audit row written, a tech can't save. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000ae01', '14085550801', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ae02', '14085550802', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-00000000ae01') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000ae0a1', 'ownerName', 'Mai', 'salonName', 'Amen Nails', 'state', 'CA', 'step', 9,
  'hours', (select jsonb_agg(jsonb_build_object('on', true, 'open', '09:00', 'close', '19:00')) from generate_series(1, 7)),
  'services', '[]'::jsonb,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000ae07a', 'name', 'Kim', 'phone', '+14085550802', 'role', 'tech'))));
select public.booking_settings_save('00000000-0000-0000-0000-0000000ae0a1', '{"cancel_hours": 5}');
insert into t_out values ('save', public.booking_settings_save('00000000-0000-0000-0000-0000000ae0a1', '{"amenities": ["wifi", "bogus", "wine", "wifi"]}'));
insert into t_out values ('set', (select booking_settings from public.salons where id = '00000000-0000-0000-0000-0000000ae0a1'));
insert into t_out values ('audit', to_jsonb((select count(*) from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000ae0a1' and action = 'amenities.saved')));
select public.booking_settings_save('00000000-0000-0000-0000-0000000ae0a1', '{"days_ahead": 20}');
insert into t_out values ('kept', (select booking_settings->'amenities' from public.salons where id = '00000000-0000-0000-0000-0000000ae0a1'));
insert into t_out values ('slug', to_jsonb((select slug from public.salons where id = '00000000-0000-0000-0000-0000000ae0a1')));
reset role;
set local role anon;
insert into t_out values ('page', public.book_page((select v #>> '{}' from t_out where k = 'slug')));
reset role;
-- a tech (own login) can't change it
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae02","role":"authenticated"}', true);
do $$ begin
  perform public.booking_settings_save('00000000-0000-0000-0000-0000000ae0a1', '{"amenities": []}');
  insert into t_out values ('tech', 'true'::jsonb);
exception when others then insert into t_out values ('tech', 'false'::jsonb); end $$;
reset role;
do $$ declare o jsonb := (select jsonb_object_agg(k, v) from t_out); begin
  if (o->'save'->>'ok')::boolean is not true then raise exception 'FAIL save: %', o->'save'; end if;
  if o->'set'->'amenities' <> '["wine", "wifi"]'::jsonb then raise exception 'FAIL clean: %', o->'set'->'amenities'; end if;
  if (o->'set'->>'cancel_hours')::int <> 5 then raise exception 'FAIL other settings: %', o->'set'; end if;
  if (o->>'audit')::int <> 1 then raise exception 'FAIL audit: %', o->'audit'; end if;
  if o->'kept' <> '["wine", "wifi"]'::jsonb then raise exception 'FAIL kept: %', o->'kept'; end if;
  if o->'page'->'salon'->'settings'->'amenities' <> '["wine", "wifi"]'::jsonb then raise exception 'FAIL page: %', o->'page'->'salon'->'settings'; end if;
  if (o->>'tech')::boolean then raise exception 'FAIL tech could save'; end if;
  raise notice 'PASS amenities';
end $$;
rollback;
