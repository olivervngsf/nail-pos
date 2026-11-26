-- Activity log: owner + manager see every row of their salon (audit + clock), techs see nothing, Founder Admin rows
-- (admin.*) never show, and private keys (ip, code, pin…) are cut from the detail. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000ac01', '14085550931', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ac02', '14085550932', 'authenticated', 'authenticated');
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-00000000ac01') on conflict do nothing;  -- salons are invite-only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000081c1', 'ownerName', 'Mai', 'salonName', 'Log Nails', 'state', 'CA', 'step', 2,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000081cf', 'name', 'Kim', 'phone', '+14085550932', 'role', 'tech'))));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac02","role":"authenticated"}', true);
select public.claim_memberships();
reset role;
-- rows written by the server
insert into public.audit_log (salon_id, action, detail) values
  ('00000000-0000-0000-0000-0000000081c1', 'pin.wrong', jsonb_build_object('purpose', 'unlock', 'membership', '00000000-0000-0000-0000-0000000081cf')),
  ('00000000-0000-0000-0000-0000000081c1', 'clock.refused', jsonb_build_object('kind', 'in', 'reason', 'not_wifi', 'ip', '203.0.113.9')),
  ('00000000-0000-0000-0000-0000000081c1', 'admin.note', jsonb_build_object('note', 'private call note'));
insert into public.clock_events (salon_id, membership_id, kind, source) values
  ('00000000-0000-0000-0000-0000000081c1', '00000000-0000-0000-0000-0000000081cf', 'in', 'pin');
set local role authenticated;
-- owner sees it all, minus admin rows and private keys
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac01","role":"authenticated"}', true);
do $$ declare n int; begin
  if exists (select 1 from public.activity_log('00000000-0000-0000-0000-0000000081c1', now() - interval '1 hour', now() + interval '1 minute') where action like 'admin.%') then raise exception 'FAIL admin row shown'; end if;
  if (select actor from public.activity_log('00000000-0000-0000-0000-0000000081c1', now() - interval '1 hour', now() + interval '1 minute') where action = 'pin.wrong') <> 'Kim' then raise exception 'FAIL pin row should name Kim'; end if;
  if (select detail ? 'ip' from public.activity_log('00000000-0000-0000-0000-0000000081c1', now() - interval '1 hour', now() + interval '1 minute') where action = 'clock.refused') then raise exception 'FAIL ip not cut'; end if;
  if not exists (select 1 from public.activity_log('00000000-0000-0000-0000-0000000081c1', now() - interval '1 hour', now() + interval '1 minute') where action = 'clock.in' and actor = 'Kim') then raise exception 'FAIL clock row missing'; end if;
end $$;
-- the tech sees nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac02","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.activity_log('00000000-0000-0000-0000-0000000081c1', now() - interval '1 hour', now() + interval '1 minute')) then raise exception 'FAIL tech sees the log'; end if;
end $$;
select 'activity_log ok';
rollback;
