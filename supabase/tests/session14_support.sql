-- M14 support access (migration 20261212000001_support_access): an admin sees health only until the owner turns support on;
-- then the admin can open the salon (as "PolishOS support"), every change is logged, and it ends by itself after 24 h or
-- when ended. Only the owner can turn it on. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000ae01', '14085550911', 'authenticated', 'authenticated'),  -- platform admin
  ('00000000-0000-0000-0000-00000000ae02', '14085550912', 'authenticated', 'authenticated');  -- salon owner
insert into public.platform_admins (auth_user_id, note) values ('00000000-0000-0000-0000-00000000ae01', 'test admin');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
set local role authenticated;

-- admin adds the salon, owner signs in and claims it
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);
insert into t_out select 'made', public.admin_create_salon('Help Nails', 'CA', 'Hana Owner', '+14085550912');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae02","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('sid', to_jsonb((select salon_id from public.my_memberships() limit 1)));

-- 1. no grant: admin is outside the wall and the salon isn't in the support list
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);
do $$ declare sid uuid := (select (v #>> '{}')::uuid from t_out where k = 'sid'); begin
  if public.is_member(sid) or public.is_admin(sid) or public._is_desk(sid) then raise exception 'FAIL: admin inside without support'; end if;
  if exists (select 1 from public.my_memberships() where salon_id = sid) then raise exception 'FAIL: salon listed without support'; end if;
  if exists (select 1 from public.admin_support_on() where salon_id = sid) then raise exception 'FAIL: support listed before grant'; end if;
  begin perform public.support_grant(sid); raise exception 'FAIL: admin turned support on';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- 2. owner turns support on
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae02","role":"authenticated"}', true);
insert into t_out select 'grant', public.support_grant((select (v #>> '{}')::uuid from t_out where k = 'sid'), 'card reader help');

-- 3. admin is inside, listed as support, and a change is logged
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);
do $$ declare sid uuid := (select (v #>> '{}')::uuid from t_out where k = 'sid'); m record; begin
  if not (public.is_member(sid) and public.is_admin(sid) and public._is_desk(sid)) then raise exception 'FAIL: admin not inside with support'; end if;
  select * into m from public.my_memberships() where salon_id = sid;
  if m.display_name <> 'PolishOS support' or m.support_until is null or m.membership_id is not null then raise exception 'FAIL: support row %', m; end if;
  if not exists (select 1 from public.admin_support_on() where salon_id = sid and reason = 'card reader help') then raise exception 'FAIL: admin list should show support on'; end if;
end $$;
update public.salons set name = 'Help Nails & Spa' where id = (select (v #>> '{}')::uuid from t_out where k = 'sid');

-- 4. owner sees it on, with the change in the log
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae02","role":"authenticated"}', true);
insert into t_out select 'status', public.support_status((select (v #>> '{}')::uuid from t_out where k = 'sid'));

-- 5. 24 hours pass: support is off by itself
reset role;
update public.support_grants set starts_at = now() - interval '25 hours', ends_at = now() - interval '1 hour';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);
do $$ declare sid uuid := (select (v #>> '{}')::uuid from t_out where k = 'sid'); begin
  if public.is_member(sid) then raise exception 'FAIL: support did not expire'; end if;
  if exists (select 1 from public.my_memberships() where salon_id = sid) then raise exception 'FAIL: expired salon still listed'; end if;
end $$;

-- 6. on again, then the admin ends it now
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae02","role":"authenticated"}', true);
select public.support_grant((select (v #>> '{}')::uuid from t_out where k = 'sid'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);
select public.support_end((select (v #>> '{}')::uuid from t_out where k = 'sid'));
do $$ declare sid uuid := (select (v #>> '{}')::uuid from t_out where k = 'sid'); begin
  if public.is_member(sid) then raise exception 'FAIL: End now did not end it'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae02","role":"authenticated"}', true);
insert into t_out select 'status2', public.support_status((select (v #>> '{}')::uuid from t_out where k = 'sid'));
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out); acts text;
begin
  if (o->'status'->>'on')::boolean is not true or o->'status'->>'reason' <> 'card reader help' then raise exception 'FAIL status on: %', o->'status'; end if;
  select string_agg(x->>'action' || ':' || coalesce(x->>'what', ''), ',') into acts from jsonb_array_elements(o->'status'->'log') x;
  if acts not like '%support.change:salons update%' or acts not like '%support.on%' then raise exception 'FAIL log: %', acts; end if;
  if (o->'status2'->>'on')::boolean then raise exception 'FAIL status2 still on'; end if;
  select string_agg(x->>'action', ',') into acts from jsonb_array_elements(o->'status2'->'log') x;
  if acts not like 'support.off%' then raise exception 'FAIL end not logged first: %', acts; end if;
  if jsonb_array_length(o->'status2'->'past') <> 2 then raise exception 'FAIL past windows: %', o->'status2'->'past'; end if;
  raise notice 'PASS session14_support';
end $$;
rollback;
