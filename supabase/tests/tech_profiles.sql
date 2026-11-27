-- Tech profiles (migration 20270131000001): a tech edits only their own profile; new work photos wait for the owner's OK;
-- the owner sees everyone, OKs photos, asks for updates and switches the photo OK off; the public booking page gets
-- first names + shown photos only; Roles can take a tech's right away. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', '14085554001', 'authenticated', 'authenticated'),   -- owner
  ('00000000-0000-0000-0000-0000000000e2', '14085554002', 'authenticated', 'authenticated'),   -- Kim, tech
  ('00000000-0000-0000-0000-0000000000e3', '14085554003', 'authenticated', 'authenticated');   -- Lan, tech
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-0000000000e1') on conflict do nothing; -- invite-only salons
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000e00a1', 'ownerName', 'Mai', 'salonName', 'Profile Nails', 'state', 'CA', 'step', 9,
  'hours', (select jsonb_agg(jsonb_build_object('on', true, 'open', '09:00', 'close', '19:00')) from generate_series(1, 7)),
  'services', '[]'::jsonb,
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000e007a', 'name', 'Kim Tran', 'phone', '+14085554002', 'role', 'tech'),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000e007b', 'name', 'Lan Vo', 'phone', '+14085554003', 'role', 'tech'))));
insert into t_out values ('slug', to_jsonb((select slug from public.salons where id = '00000000-0000-0000-0000-0000000e00a1')));

-- Kim: own profile + a work photo (waits for the OK); can't touch Lan's, can't see the owner list
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('kim_save', public.staff_profile_save('00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e007a',
  '{"about":"  Detail work is my favorite.  ","bestAt":["Nail art","Gel","nail art",""],"languages":["Vietnamese","English"],"years":"8"}'));
insert into t_out values ('kim_photo', public.staff_photo_add('00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e007a',
  '00000000-0000-0000-0000-0000000e0f01', '00000000-0000-0000-0000-0000000e00a1/00000000-0000-0000-0000-0000000e007a/a.jpg', 'Ombre'));
do $$ begin
  begin perform public.staff_profile_save('00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e007b', '{"about":"hi"}');
    insert into t_out values ('kim_edits_lan', 'true'); exception when others then insert into t_out values ('kim_edits_lan', 'false'); end;
  begin perform public.staff_profiles_list('00000000-0000-0000-0000-0000000e00a1');
    insert into t_out values ('kim_list', 'true'); exception when others then insert into t_out values ('kim_list', 'false'); end;
  begin perform public.staff_photo_decide('00000000-0000-0000-0000-0000000e0f01', true);
    insert into t_out values ('kim_oks_own', 'true'); exception when others then insert into t_out values ('kim_oks_own', 'false'); end;
end $$;

-- Owner: sees both, the waiting photo, OKs it, asks Lan, turns the photo OK off, adds a photo for Lan (shown at once)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
insert into t_out values ('list', public.staff_profiles_list('00000000-0000-0000-0000-0000000e00a1'));
reset role;
set local role anon;
insert into t_out values ('public_before', public.book_team((select v #>> '{}' from t_out where k = 'slug')));
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select public.staff_photo_decide('00000000-0000-0000-0000-0000000e0f01', true);
insert into t_out values ('ask', public.staff_profile_ask('00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e007b'));
insert into t_out values ('settings', public.staff_profile_settings_save('00000000-0000-0000-0000-0000000e00a1', '{"photoOk":false}'));
insert into t_out values ('lan_photo', public.staff_photo_add('00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e007b',
  '00000000-0000-0000-0000-0000000e0f02', '00000000-0000-0000-0000-0000000e00a1/00000000-0000-0000-0000-0000000e007b/b.jpg', 'Pedi'));
-- Roles: the owner takes away a tech's own-profile right
insert into t_out values ('roles', public.role_perms_save('00000000-0000-0000-0000-0000000e00a1', '{"tech":{"pf.own":false,"ok.refund":true}}'));
reset role;
set local role anon;
insert into t_out values ('public_after', public.book_team((select v #>> '{}' from t_out where k = 'slug')));
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
do $$ begin
  begin perform public.staff_profile_save('00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e007a', '{"about":"again"}');
    insert into t_out values ('kim_after_roles', 'true'); exception when others then insert into t_out values ('kim_after_roles', 'false'); end;
end $$;
reset role;
insert into t_out values ('audit', to_jsonb((select count(*) from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000e00a1' and action like 'profile.%')));

do $$ declare o jsonb := (select jsonb_object_agg(k, v) from t_out); kim jsonb; begin
  if o->'kim_save'->>'about' <> 'Detail work is my favorite.' or o->'kim_save'->'bestAt' <> '["Nail art","Gel"]'::jsonb
     or (o->'kim_save'->>'years')::int <> 8 then raise exception 'FAIL kim save: %', o->'kim_save'; end if;
  if o->'kim_photo'->>'status' <> 'waiting' then raise exception 'FAIL kim photo should wait: %', o->'kim_photo'; end if;
  if (o->>'kim_edits_lan')::boolean or (o->>'kim_list')::boolean or (o->>'kim_oks_own')::boolean then
    raise exception 'FAIL tech rights: lan % list % ok %', o->'kim_edits_lan', o->'kim_list', o->'kim_oks_own'; end if;
  if jsonb_array_length(o->'list'->'people') <> 2 then raise exception 'FAIL list: %', o->'list'; end if;
  select x into kim from jsonb_array_elements(o->'public_before'->'team') x where x->>'name' = 'Kim';
  if kim is null or jsonb_array_length(kim->'photos') <> 0 or kim ? 'phone' then raise exception 'FAIL public before: %', o->'public_before'; end if;
  if (o->'public_before'->'team') @> '[{"name":"Kim Tran"}]' then raise exception 'FAIL last name shown'; end if;
  if o->'ask'->>'ok' <> 'true' or (o->'settings'->>'photoOk')::boolean then raise exception 'FAIL ask/settings: % %', o->'ask', o->'settings'; end if;
  if o->'lan_photo'->>'status' <> 'shown' then raise exception 'FAIL lan photo: %', o->'lan_photo'; end if;
  if o->'roles' <> '{"tech":{"pf.own":false}}'::jsonb then raise exception 'FAIL roles (tech keeps only pf.own): %', o->'roles'; end if;
  select x into kim from jsonb_array_elements(o->'public_after'->'team') x where x->>'name' = 'Kim';
  if jsonb_array_length(kim->'photos') <> 1 then raise exception 'FAIL public after: %', o->'public_after'; end if;
  if (o->>'kim_after_roles')::boolean then raise exception 'FAIL tech still edits after roles off'; end if;
  if (o->>'audit')::int < 5 then raise exception 'FAIL audit: %', o->'audit'; end if;
  raise notice 'PASS tech_profiles';
end $$;
rollback;
