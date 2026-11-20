-- Salon health table (migration 20270107000001_admin_signals): a salon device reports speed counts (vitals_report);
-- an outsider can't; silly numbers are refused; reports add up per day; admin_health + admin_signals show them to a
-- platform admin only; the owner can't read app_vitals or admin_signals. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000b101', '14085550931', 'authenticated', 'authenticated'),  -- platform admin
  ('00000000-0000-0000-0000-00000000b102', '14085550932', 'authenticated', 'authenticated'),  -- salon owner
  ('00000000-0000-0000-0000-00000000b103', '14085550933', 'authenticated', 'authenticated');  -- someone else
insert into public.platform_admins (auth_user_id, note) values ('00000000-0000-0000-0000-00000000b101', 'test admin');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b101","role":"authenticated"}', true);
insert into t_out select 'made', public.admin_create_salon('Speed Nails', 'CA', 'Sue Owner', '+14085550932');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b102","role":"authenticated","phone":"14085550932"}', true);
select public.claim_memberships();
insert into t_out select 'dev', to_jsonb(public.register_device(((select v from t_out where k = 'made')->>'salon_id')::uuid, 'Front desk iPad', 'front_desk'));

-- inside the salon: two reports add up; silly numbers refused
do $$ declare did uuid := (select v #>> '{}' from t_out where k = 'dev')::uuid; begin
  if not public.vitals_report(did, 10, 15000, 1, 0) then raise exception 'FAIL: first report refused'; end if;
  if not public.vitals_report(did, 10, 25000, 2, 3, 'Load failed') then raise exception 'FAIL: second report refused'; end if;
  if public.vitals_report(did, 5, 5000, 6, 0) then raise exception 'FAIL: more slow loads than loads accepted'; end if;
  if public.vitals_report(did, 1, 999999999, 0, 0) then raise exception 'FAIL: impossible load time accepted'; end if;
  if public.vitals_report(did, -1, 0, 0, 0) then raise exception 'FAIL: negative loads accepted'; end if;
end $$;
-- the owner can't read the table or the admin view
do $$ begin
  if (select count(*) from public.app_vitals) <> 0 then raise exception 'FAIL: owner reads app_vitals'; end if;
  begin perform public.admin_signals(((select v from t_out where k = 'made')->>'salon_id')::uuid); raise exception 'FAIL: owner read admin_signals';
  exception when insufficient_privilege then null; end;
end $$;

-- someone else: refused
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b103","role":"authenticated","phone":"14085550933"}', true);
do $$ begin
  if public.vitals_report((select v #>> '{}' from t_out where k = 'dev')::uuid, 1, 1000, 0, 0) then raise exception 'FAIL: outsider reported'; end if;
end $$;

-- the admin sees: 20 loads, 2s average, 3 slow, 3 errors
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b101","role":"authenticated"}', true);
do $$ declare sid uuid := ((select v from t_out where k = 'made')->>'salon_id')::uuid; s jsonb; g jsonb; begin
  select x into s from jsonb_array_elements(public.admin_health()->'salons') x where (x->>'salon_id')::uuid = sid;
  if (s->>'speed_loads')::int <> 20 or (s->>'speed_ms')::int <> 2000 or (s->>'speed_slow')::int <> 3 or (s->>'speed_errors')::int <> 3
    then raise exception 'FAIL admin_health speed: %', s; end if;
  if (s->>'texts_30d')::int <> 0 or s ? 'cards_today' is false then raise exception 'FAIL admin_health texts/cards: %', s; end if;
  g := public.admin_signals(sid);
  if jsonb_array_length(g->'vitals') <> 1 or (g->'vitals'->0->>'last_error') <> 'Load failed' then raise exception 'FAIL admin_signals: %', g; end if;
end $$;
reset role;
select 'PASS admin_signals';
rollback;
