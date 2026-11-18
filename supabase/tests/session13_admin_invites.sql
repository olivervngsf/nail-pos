-- Invite-only salons + /admin (migration 20261130000000_invites_admin): a normal signed-in person can't make a salon;
-- a platform admin can, the owner's phone sign-in claims it, and admin functions refuse non-admins. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000ad01', '14085550901', 'authenticated', 'authenticated'),  -- platform admin
  ('00000000-0000-0000-0000-00000000ad02', '14085550902', 'authenticated', 'authenticated'),  -- invited owner
  ('00000000-0000-0000-0000-00000000ad03', '14085550903', 'authenticated', 'authenticated');  -- someone else
insert into public.platform_admins (auth_user_id, note) values ('00000000-0000-0000-0000-00000000ad01', 'test admin');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;

set local role authenticated;

-- someone else: no salon by self-serve, no admin functions
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ad03","role":"authenticated"}', true);
do $$ begin
  if public.is_platform_admin() then raise exception 'FAIL: non-admin is admin'; end if;
  begin
    perform public.create_salon('Sneaky Nails', 'CA', 'Sneak', '+14085550903');
    raise exception 'FAIL: self-serve salon allowed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.admin_create_salon('Sneaky Nails', 'CA', 'Sneak', '+14085550903');
    raise exception 'FAIL: admin_create_salon allowed for non-admin';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  if exists (select 1 from public.admin_salons()) then raise exception 'FAIL: admin_salons visible to non-admin'; end if;
end $$;

-- admin: adds a salon by invite and sees it in the list
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ad01","role":"authenticated"}', true);
insert into t_out select 'made', public.admin_create_salon('Invite Nails', 'CA', 'Ivy Owner', '+14085550902');
do $$ declare r record; begin
  if not public.is_platform_admin() then raise exception 'FAIL: admin not admin'; end if;
  select * into r from public.admin_salons() where salon_name = 'Invite Nails';
  if r.salon_id is null or r.owner_joined or r.code is null then raise exception 'FAIL: admin list wrong %', r; end if;
end $$;

-- invited owner signs in by phone: the salon becomes theirs
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ad02","role":"authenticated","phone":"14085550902"}', true);
do $$ begin
  perform public.claim_memberships();
  if not public.is_admin(((select v from t_out where k = 'made')->>'salon_id')::uuid) then raise exception 'FAIL: owner did not get the invited salon'; end if;
end $$;

select 'PASS: invite-only salons + admin' as result;
rollback;
