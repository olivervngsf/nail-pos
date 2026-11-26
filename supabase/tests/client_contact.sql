-- Call / Text buttons (owner setting): only the owner saves; each tap is checked against the setting and logged. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fe01', '14085554001', 'authenticated', 'authenticated'),   -- owner
  ('00000000-0000-0000-0000-00000000fe02', '14085554002', 'authenticated', 'authenticated'),   -- manager
  ('00000000-0000-0000-0000-00000000fe03', '14085554003', 'authenticated', 'authenticated');   -- front desk
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
insert into public.platform_admins (auth_user_id) select id from auth.users where id = '00000000-0000-0000-0000-00000000fe01';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000080a1', 'ownerName', 'Mai', 'salonName', 'Call Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000808a', 'name', 'Bao', 'phone', '+14085554002', 'role', 'manager'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000808b', 'name', 'Hanh', 'phone', '+14085554003', 'role', 'front_desk'))));
insert into t_out values ('default', public.contact_settings_get('00000000-0000-0000-0000-0000000080a1'));
-- owner: call = manager only, text = nobody (bad role names are dropped)
insert into t_out values ('saved', public.contact_settings_save('00000000-0000-0000-0000-0000000080a1', '{"call":["manager","boss"],"text":[]}'));
select public.client_contact_log('00000000-0000-0000-0000-0000000080a1', null, null, 'text');   -- owner: always allowed
-- manager: may call, can't text, can't change the setting
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe02","role":"authenticated"}', true);
select public.claim_memberships();
select public.client_contact_log('00000000-0000-0000-0000-0000000080a1', null, null, 'call');
do $$ begin
  begin perform public.client_contact_log('00000000-0000-0000-0000-0000000080a1', null, null, 'text'); insert into t_out values ('mgr_text', 'true');
  exception when others then insert into t_out values ('mgr_text', 'false'); end;
  begin perform public.contact_settings_save('00000000-0000-0000-0000-0000000080a1', '{"call":["tech"]}'); insert into t_out values ('mgr_save', 'true');
  exception when others then insert into t_out values ('mgr_save', 'false'); end;
end $$;
-- front desk: can't call
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe03","role":"authenticated"}', true);
select public.claim_memberships();
do $$ begin
  begin perform public.client_contact_log('00000000-0000-0000-0000-0000000080a1', null, null, 'call'); insert into t_out values ('desk_call', 'true');
  exception when others then insert into t_out values ('desk_call', 'false'); end;
end $$;
reset role;
insert into t_out values
  ('called', to_jsonb((select count(*) from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000080a1' and action = 'client.called'))),
  ('texted', to_jsonb((select count(*) from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000080a1' and action = 'client.texted')));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->'default' <> '{"call":["front_desk","manager"],"text":["front_desk","manager"]}'::jsonb then raise exception 'FAIL default: %', o->'default'; end if;
  if o->'saved' <> '{"call":["manager"],"text":[]}'::jsonb then raise exception 'FAIL saved: %', o->'saved'; end if;
  if (o->>'mgr_text')::boolean then raise exception 'FAIL manager could text with text off'; end if;
  if (o->>'mgr_save')::boolean then raise exception 'FAIL manager changed the owner setting'; end if;
  if (o->>'desk_call')::boolean then raise exception 'FAIL front desk could call with call off for desk'; end if;
  if (o->>'called')::int <> 1 or (o->>'texted')::int <> 1 then raise exception 'FAIL log counts: % called, % texted', o->'called', o->'texted'; end if;
  raise notice 'PASS client_contact';
end $$;
rollback;
