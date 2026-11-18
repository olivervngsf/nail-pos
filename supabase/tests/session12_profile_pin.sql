-- Profile, PIN + Settings (Nov 17) in SQL. Rolls back.
-- PIN length rule (6 / 10), old-length PIN works once then asks for a new one, every try logged with its purpose,
-- owner-only PIN rules + pay + device sign-out, managers can't touch the owner, techs see no team details.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000dd01', '14085550401', 'authenticated', 'authenticated'),  -- owner Mai
  ('00000000-0000-0000-0000-00000000dd02', '14085550402', 'authenticated', 'authenticated'),  -- manager Bao
  ('00000000-0000-0000-0000-00000000dd03', '14085550403', 'authenticated', 'authenticated');  -- tech Kim
insert into public.people (id, auth_user_id, phone, name) values
  ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-00000000dd01', '+14085550401', 'Mai'),
  ('00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-00000000dd02', '+14085550402', 'Bao'),
  ('00000000-0000-0000-0000-0000000008a3', '00000000-0000-0000-0000-00000000dd03', '+14085550403', 'Kim');

-- Salons are invite-only (Nov 17): test users may create salons like a platform admin.
insert into public.platform_admins (auth_user_id) select id from auth.users where id::text like '00000000-0000-0000-0000-%' on conflict do nothing;
alter table public.salons disable trigger user;  -- salons are made by invite; this test makes one directly
insert into public.salons (id, name, state) values ('00000000-0000-0000-0000-0000000008b1', 'Pin Nails', 'CA');
alter table public.salons enable trigger user;
insert into public.memberships (id, salon_id, person_id, display_name, phone, role, pay_type, commission_pct) values
  ('00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-0000000008a1', 'Mai', '+14085550401', 'owner', null, null),
  ('00000000-0000-0000-0000-0000000008c2', '00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-0000000008a2', 'Bao', '+14085550402', 'manager', 'hourly', null),
  ('00000000-0000-0000-0000-0000000008c3', '00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-0000000008a3', 'Kim', '+14085550403', 'tech', 'commission', 60);
insert into public.devices (id, salon_id, name, kind, signed_in_by) values
  ('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008b1', 'Front desk', 'front_desk', '00000000-0000-0000-0000-0000000008a1');
-- Kim has an old 4-digit PIN from before the rule
update public.memberships set pin_hash = extensions.crypt('2580', extensions.gen_salt('bf')), pin_len = 4 where id = '00000000-0000-0000-0000-0000000008c3';

create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated;
set local role authenticated;

-- owner: 4 digits refused, easy 6 refused, good 6 OK; rules readable
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd01","role":"authenticated"}', true);
do $$ begin
  begin perform public.set_my_pin('00000000-0000-0000-0000-0000000008b1', '2580'); raise exception 'FAIL: 4-digit PIN taken';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.set_my_pin('00000000-0000-0000-0000-0000000008b1', '123456'); raise exception 'FAIL: 123456 taken';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.set_my_pin('00000000-0000-0000-0000-0000000008b1', '258013');
  if (public.pin_rules('00000000-0000-0000-0000-0000000008b1')->>'length')::int <> 6 then raise exception 'FAIL: default length not 6'; end if;
end $$;

-- old 4-digit PIN still opens once and asks for a new one; new one must match the rule
do $$ declare r jsonb; begin
  r := public.pin_unlock('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008c3', '2580');
  if not (r->>'ok')::boolean or not (r->>'needs_new')::boolean then raise exception 'FAIL: old PIN should open + ask new: %', r; end if;
  r := public.pin_set_new('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008c3', '2580', '111111');
  if r->>'reason' <> 'weak' then raise exception 'FAIL: weak new PIN taken: %', r; end if;
  r := public.pin_set_new('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008c3', '2580', '470215');
  if not (r->>'ok')::boolean then raise exception 'FAIL: new PIN not saved: %', r; end if;
  r := public.pin_unlock('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008c3', '470215');
  if not (r->>'ok')::boolean or (r->>'needs_new')::boolean then raise exception 'FAIL: new PIN should open cleanly: %', r; end if;
  -- wrong tries count down, purpose is logged
  r := public.pin_clock('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008c3', '000001', 'in');
  if (r->>'tries_left')::int <> 4 then raise exception 'FAIL: tries left %', r; end if;
end $$;
insert into t_out select 'log', coalesce(jsonb_agg(jsonb_build_object('a', action, 'p', purpose, 'who', person) order by at), '[]')
  from public.pin_activity('00000000-0000-0000-0000-0000000008b1', 1) where action like 'pin.%';

-- owner sets 10 digits; Kim's 6-digit PIN now asks for a new one
do $$ declare r jsonb; begin
  perform public.set_pin_rules('00000000-0000-0000-0000-0000000008b1', '{"length": 10, "lock_after": 3}');
  r := public.pin_unlock('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008c3', '470215');
  if not (r->>'needs_new')::boolean then raise exception 'FAIL: rule change should ask for a new PIN'; end if;
  r := public.pin_set_new('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008c3', '470215', '4085550403');
  if not (r->>'ok')::boolean then raise exception 'FAIL: 10-digit PIN not saved: %', r; end if;
  -- 3 wrong = locked (rule)
  perform public.pin_unlock('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008c3', '1111111112');
  perform public.pin_unlock('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008c3', '1111111113');
  r := public.pin_unlock('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008c3', '1111111114');
  if r->>'reason' <> 'locked' then raise exception 'FAIL: 3 wrong should lock: %', r; end if;
end $$;

-- owner adds a tech with pay + details; manager's pay is ignored; tech sees nothing
do $$ declare r jsonb; begin
  r := public.team_save('{"salonId":"00000000-0000-0000-0000-0000000008b1","name":"Linh","phone":"+14085550404","role":"tech","language":"vi",
    "payType":"commission","commissionPct":"55","checkPct":"70","skills":["Gel","Dip"],"workdays":["1","2","9"],"licenseNo":"M 1","licenseExpires":"2027-03-01"}');
  insert into t_out values ('linh', r);
  if coalesce(r->>'invite', '') = '' then raise exception 'FAIL: no invite code'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd02","role":"authenticated"}', true);
do $$ declare id uuid := (select (v->>'id')::uuid from t_out where k = 'linh'); begin
  perform public.team_save(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000008b1', 'id', id, 'name', 'Linh P', 'phone', '+14085550404',
    'role', 'tech', 'payType', 'hourly', 'commissionPct', '99'));
  begin perform public.team_save('{"salonId":"00000000-0000-0000-0000-0000000008b1","id":"00000000-0000-0000-0000-0000000008c1","name":"X","phone":"+14085550401","role":"tech"}');
    raise exception 'FAIL: manager edited the owner';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.team_save('{"salonId":"00000000-0000-0000-0000-0000000008b1","name":"Boss","phone":"+14085550405","role":"owner"}');
    raise exception 'FAIL: manager added an owner';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.set_pin_rules('00000000-0000-0000-0000-0000000008b1', '{"length": 6}'); raise exception 'FAIL: manager changed PIN rules';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.device_archive('00000000-0000-0000-0000-0000000008d1'); raise exception 'FAIL: manager signed out a device';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.device_save('00000000-0000-0000-0000-0000000008d1', 'Back room', 'clock');
end $$;
insert into t_out select 'linh_row', x from jsonb_array_elements(public.team_list('00000000-0000-0000-0000-0000000008b1')) x where x->>'phone' = '+14085550404';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd03","role":"authenticated"}', true);
insert into t_out values ('tech_team', public.team_list('00000000-0000-0000-0000-0000000008b1'));
insert into t_out values ('tech_log', (select to_jsonb(count(*)) from public.pin_activity('00000000-0000-0000-0000-0000000008b1', 7)));
do $$ begin
  perform public.team_save('{"salonId":"00000000-0000-0000-0000-0000000008b1","name":"Z","phone":"+14085550406","role":"tech"}');
  raise exception 'FAIL: tech added staff';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd01","role":"authenticated"}', true);
select public.device_archive('00000000-0000-0000-0000-0000000008d1');
reset role;

do $$ declare o jsonb := (select jsonb_object_agg(k, v) from t_out); l jsonb := o->'linh_row'; begin
  if not (o->'log' @> '[{"a":"pin.ok","p":"unlock","who":"Kim"},{"a":"pin.changed"},{"a":"pin.wrong","p":"clock_in","who":"Kim"}]')
    then raise exception 'FAIL log: %', o->'log'; end if;
  if l->>'name' <> 'Linh P' or l->>'payType' <> 'commission' or (l->>'commissionPct')::numeric <> 55 or (l->>'checkPct')::int <> 70
    then raise exception 'FAIL manager changed pay or name not saved: %', l; end if;
  if l->'skills' <> '["Gel","Dip"]' or l->'workdays' <> '[1,2]' or l->>'language' <> 'vi' then raise exception 'FAIL details: %', l; end if;
  if o->'tech_team' <> '[]' or (o->>'tech_log')::int <> 0 then raise exception 'FAIL tech saw team or log'; end if;
  if (select kind from public.devices where id = '00000000-0000-0000-0000-0000000008d1') <> 'clock' then raise exception 'FAIL device job'; end if;
  if (select archived_at from public.devices where id = '00000000-0000-0000-0000-0000000008d1') is null then raise exception 'FAIL owner sign out'; end if;
  if not ('desk' = any (public._slug_reserved())) then raise exception 'FAIL slug'; end if;
  raise notice 'PASS session12_profile_pin';
end $$;
select 'PASS session12_profile_pin' as result;
rollback;
