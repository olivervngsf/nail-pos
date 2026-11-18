-- Save a one-time service to the menu: needs an owner/manager OK ('menu'), used once; techs can't; no duplicate names.
-- Owner on their own login gets the OK in one step. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fb01', '14085550801', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fb02', '14085550802', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
create function pg_temp.try(k text, p jsonb) returns void language plpgsql as $$
begin
  insert into t_out values (k, to_jsonb(public.menu_add_service(p)::text));
exception when others then
  insert into t_out values (k, to_jsonb('ERR ' || sqlerrm));
end $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000070a1', 'ownerName', 'Mai', 'salonName', 'Menu Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000707f', 'name', 'Kim', 'phone', '+14085550802', 'role', 'tech'))));

-- Owner: no OK → refused; with an OK → saved; the same OK twice → refused; same name again → refused
select pg_temp.try('no_ok', '{"salonId":"00000000-0000-0000-0000-0000000070a1","name":"Nail repair","cat":"Add-ons","minutes":15,"cents":700}');
insert into t_out values ('ok1', public.approve_discount('00000000-0000-0000-0000-0000000070a1', p_purpose => 'menu'));
select pg_temp.try('saved', jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000070a1', 'approvalId', (select v->>'approval_id' from t_out where k = 'ok1'),
  'name', 'Nail repair', 'cat', 'Add-ons', 'minutes', 15, 'cents', 700));
select pg_temp.try('reused', jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000070a1', 'approvalId', (select v->>'approval_id' from t_out where k = 'ok1'),
  'name', 'Soak off', 'cat', 'Add-ons', 'minutes', 15, 'cents', 1000));
insert into t_out values ('ok2', public.approve_discount('00000000-0000-0000-0000-0000000070a1', p_purpose => 'menu'));
select pg_temp.try('dup', jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000070a1', 'approvalId', (select v->>'approval_id' from t_out where k = 'ok2'),
  'name', '  NAIL repair', 'cat', 'Add-ons', 'minutes', 15, 'cents', 700));

-- Kim (tech, own login): can't approve, can't save
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb02","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('tech_ok', public.approve_discount('00000000-0000-0000-0000-0000000070a1', p_purpose => 'menu'));
select pg_temp.try('tech_save', jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000070a1', 'approvalId', (select v->>'approval_id' from t_out where k = 'ok2'),
  'name', 'Tech thing', 'cat', 'Custom', 'minutes', 15, 'cents', 100));
reset role;

do $$
declare n int; logged int;
begin
  if (select v::text from t_out where k = 'no_ok') not like '%needs an owner or manager OK%' then raise exception 'FAIL no OK was accepted: %', (select v from t_out where k = 'no_ok'); end if;
  if (select v::text from t_out where k = 'saved') like '%ERR%' then raise exception 'FAIL save: %', (select v from t_out where k = 'saved'); end if;
  select count(*) into n from public.services where salon_id = '00000000-0000-0000-0000-0000000070a1' and name = 'Nail repair' and category = 'Add-ons' and price_cents = 700 and minutes = 15;
  if n <> 1 then raise exception 'FAIL service not on the menu (%)', n; end if;
  if (select v::text from t_out where k = 'reused') not like '%needs an owner or manager OK%' then raise exception 'FAIL OK used twice'; end if;
  if (select v::text from t_out where k = 'dup') not like '%already on the menu%' then raise exception 'FAIL duplicate name saved'; end if;
  if ((select v from t_out where k = 'tech_ok')->>'ok')::boolean then raise exception 'FAIL tech approved'; end if;
  if (select v::text from t_out where k = 'tech_save') not like '%not allowed%' then raise exception 'FAIL tech saved: %', (select v from t_out where k = 'tech_save'); end if;
  select count(*) into logged from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000070a1' and action = 'service.added';
  if logged <> 1 then raise exception 'FAIL audit log (%)', logged; end if;
  raise notice 'PASS menu_add_service';
end $$;
rollback;
