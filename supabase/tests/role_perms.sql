-- Roles + permissions: defaults = owner + manager OK things, front desk doesn't; the owner turns a manager's refunds off
-- and lets the front desk give discounts; approve_discount follows it; a manager can't change it; junk is refused;
-- the change is logged once. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fe01', '14085550931', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fe02', '14085550932', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fe03', '14085550933', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v text);
grant all on t_out to authenticated, anon;
create function pg_temp.try(k text, q text) returns void language plpgsql as $$
declare r text;
begin
  execute q into r; insert into t_out values (k, r);
exception when others then insert into t_out values (k, 'ERR ' || sqlerrm);
end $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-00000000fe01') on conflict do nothing;  -- salons are invite-only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000073a1', 'ownerName', 'Mai', 'salonName', 'Role Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000737e', 'name', 'Bao', 'phone', '+14085550932', 'role', 'manager'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000737f', 'name', 'Hanh', 'phone', '+14085550933', 'role', 'front_desk'))));

-- before any change (manager + front desk, own logins)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe02","role":"authenticated"}', true);
select public.claim_memberships();
select pg_temp.try('mgr_disc0', $q$select public.approve_discount('00000000-0000-0000-0000-0000000073a1')->>'ok'$q$);
select pg_temp.try('mgr_save', $q$select public.role_perms_save('00000000-0000-0000-0000-0000000073a1', '{}')::text$q$);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe03","role":"authenticated"}', true);
select public.claim_memberships();
select pg_temp.try('fd_disc0', $q$select public.approve_discount('00000000-0000-0000-0000-0000000073a1')->>'ok'$q$);

-- owner changes it
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}', true);
select pg_temp.try('junk_role', $q$select public.role_perms_save('00000000-0000-0000-0000-0000000073a1', '{"tech":{"ok.refund":true}}')::text$q$);
select pg_temp.try('junk_perm', $q$select public.role_perms_save('00000000-0000-0000-0000-0000000073a1', '{"manager":{"ok.everything":true}}')::text$q$);
select pg_temp.try('saved', $q$select public.role_perms_save('00000000-0000-0000-0000-0000000073a1',
  '{"manager":{"ok.refund":false,"ok.close":true,"set.money":false},"front_desk":{"ok.discount":true,"set.team":true}}')::text$q$);

-- after
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe02","role":"authenticated"}', true);
select pg_temp.try('mgr_disc1', $q$select public.approve_discount('00000000-0000-0000-0000-0000000073a1')->>'ok'$q$);
select pg_temp.try('mgr_close1', $q$select public.approve_discount('00000000-0000-0000-0000-0000000073a1', p_purpose => 'close')->>'ok'$q$);
select pg_temp.try('mgr_reads', $q$select public.role_perms_get('00000000-0000-0000-0000-0000000073a1')::text$q$);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe03","role":"authenticated"}', true);
select pg_temp.try('fd_disc1', $q$select public.approve_discount('00000000-0000-0000-0000-0000000073a1')->>'ok'$q$);
select pg_temp.try('fd_menu1', $q$select public.approve_discount('00000000-0000-0000-0000-0000000073a1', p_purpose => 'menu')->>'ok'$q$);
reset role;

do $$
declare got text; s uuid := '00000000-0000-0000-0000-0000000073a1';
begin
  if (select v from t_out where k = 'mgr_disc0') <> 'true' then raise exception 'FAIL manager should OK a discount by default'; end if;
  if (select v from t_out where k = 'fd_disc0') <> 'false' then raise exception 'FAIL front desk should not OK a discount by default'; end if;
  if (select v from t_out where k = 'mgr_save') not like 'ERR%Only the owner%' then raise exception 'FAIL a manager changed permissions: %', (select v from t_out where k = 'mgr_save'); end if;
  if (select v from t_out where k = 'junk_role') not like 'ERR%Unknown role%' then raise exception 'FAIL tech role accepted'; end if;
  if (select v from t_out where k = 'junk_perm') not like 'ERR%Unknown permission%' then raise exception 'FAIL made-up permission accepted'; end if;
  -- only changes from the defaults are kept; front desk never gets Settings
  select role_perms::text into got from public.salons where id = s;
  if (select role_perms from public.salons where id = s) <> '{"manager":{"ok.refund":false,"set.money":false},"front_desk":{"ok.discount":true}}'::jsonb then
    raise exception 'FAIL saved permissions: %', got; end if;
  if (select v from t_out where k = 'mgr_disc1') <> 'true' then raise exception 'FAIL manager discount should stay on'; end if;
  if (select v from t_out where k = 'mgr_close1') <> 'true' then raise exception 'FAIL manager close should stay on'; end if;
  if not exists (select 1 from t_out where k = 'mgr_reads' and v like '%ok.refund%') then raise exception 'FAIL members should read permissions'; end if;
  if (select v from t_out where k = 'fd_disc1') <> 'true' then raise exception 'FAIL front desk should now OK a discount'; end if;
  if (select v from t_out where k = 'fd_menu1') <> 'false' then raise exception 'FAIL front desk menu should stay off'; end if;
  if public._role_can(s, 'manager', 'ok.refund') then raise exception 'FAIL manager refund should be off'; end if;
  if not public._role_can(s, 'owner', 'ok.refund') then raise exception 'FAIL owner can always'; end if;
  if public._role_can(s, 'tech', 'ok.discount') then raise exception 'FAIL techs never OK'; end if;
  if (select count(*) from public.audit_log where salon_id = s and action = 'roles.saved') <> 1 then raise exception 'FAIL should be logged once'; end if;
  raise notice 'OK role_perms';
end $$;
rollback;
