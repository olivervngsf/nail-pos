-- 2-step sign-in: an owner with a verified authenticator app sees nothing until the session is aal2;
-- without an app nothing changes; salon devices are not affected. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values ('00000000-0000-0000-0000-00000000e201', '14085554001', 'authenticated', 'authenticated');
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'no_self_serve_salon') then alter table public.salons disable trigger no_self_serve_salon; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e201","role":"authenticated","aal":"aal1"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000080a1', 'ownerName', 'Mai', 'salonName', 'Two Step Nails', 'state', 'CA', 'step', 9, 'staff', '[]'::jsonb));
do $$ begin
  if not public.is_owner('00000000-0000-0000-0000-0000000080a1') then raise exception 'FAIL: owner without app should be in'; end if;
  if public.two_step_needed() then raise exception 'FAIL: no app = no 2-step'; end if;
end $$;
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
  values (gen_random_uuid(), '00000000-0000-0000-0000-00000000e201', 'phone app', 'totp', 'verified', now(), now(), 'x');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e201","role":"authenticated","aal":"aal1"}', true);
do $$ declare s uuid := '00000000-0000-0000-0000-0000000080a1'; begin
  if public.is_member(s) or public.is_admin(s) or public.is_owner(s) or public._is_desk(s) then raise exception 'FAIL: aal1 must see nothing'; end if;
  if public.my_person_id() is not null or exists (select 1 from public.my_memberships()) then raise exception 'FAIL: aal1 person/memberships'; end if;
  if not public.two_step_needed() then raise exception 'FAIL: should ask for the code'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e201","role":"authenticated","aal":"aal2"}', true);
do $$ declare s uuid := '00000000-0000-0000-0000-0000000080a1'; begin
  if not (public.is_member(s) and public.is_admin(s) and public.is_owner(s)) then raise exception 'FAIL: aal2 owner should be in'; end if;
  if public.two_step_needed() then raise exception 'FAIL: done after code'; end if;
end $$;
reset role;
select 'session16_two_step ok' as result;
rollback;
