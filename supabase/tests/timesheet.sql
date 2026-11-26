-- Timesheet: owner sees everyone's punches; a fix keeps the old time + reason and is logged; a missing clock-out
-- can be added; a tech can't fix or read the sheet; no fix into the future. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000ad01', '14085550941', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ad02', '14085550942', 'authenticated', 'authenticated');
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-00000000ad01') on conflict do nothing;  -- salons are invite-only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ad01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000081d1', 'ownerName', 'Mai', 'salonName', 'Time Nails', 'state', 'CA', 'step', 2,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000081df', 'name', 'Tuan', 'phone', '+14085550942', 'role', 'tech'))));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ad02","role":"authenticated"}', true);
select public.claim_memberships();
reset role;
create temp table ev (id bigint) on commit drop;
grant all on ev to public;
with x as (insert into public.clock_events (salon_id, membership_id, kind, source, at) values
  ('00000000-0000-0000-0000-0000000081d1', '00000000-0000-0000-0000-0000000081df', 'in', 'pin', now() - interval '3 hours') returning id)
insert into ev select id from x;
set local role authenticated;
-- tech can't read or fix
do $$ begin
  if exists (select 1 from public.timesheet('00000000-0000-0000-0000-0000000081d1', current_date - 1, current_date + 1)) then raise exception 'FAIL tech reads the sheet'; end if;
  perform public.clock_fix('00000000-0000-0000-0000-0000000081d1', '00000000-0000-0000-0000-0000000081df', null, 'out', now(), 'forgot');
  raise exception 'FAIL tech fixed a time';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; end $$;
-- owner: sees the punch, fixes it, adds the missing clock-out
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ad01","role":"authenticated"}', true);
do $$ declare e bigint := (select id from ev); r record; begin
  select * into r from public.timesheet('00000000-0000-0000-0000-0000000081d1', current_date - 1, current_date + 1) where name = 'Tuan';
  if jsonb_array_length(r.events) <> 1 then raise exception 'FAIL expected 1 punch, got %', r.events; end if;
  perform public.clock_fix('00000000-0000-0000-0000-0000000081d1', '00000000-0000-0000-0000-0000000081df', e, null, now() - interval '2 hours', 'forgot', 'came at 10');
  perform public.clock_fix('00000000-0000-0000-0000-0000000081d1', '00000000-0000-0000-0000-0000000081df', null, 'out', now() - interval '10 minutes', 'device_off');
  select * into r from public.timesheet('00000000-0000-0000-0000-0000000081d1', current_date - 1, current_date + 1) where name = 'Tuan';
  if jsonb_array_length(r.events) <> 2 then raise exception 'FAIL expected 2 punches after fix, got %', r.events; end if;
  if (r.events->0->'fix'->>'old_at') is null then raise exception 'FAIL old time not kept'; end if;
  if (r.events->1->>'via') <> 'fix' then raise exception 'FAIL added punch should say fix'; end if;
  if (select count(*) from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000081d1' and action = 'clock.fix') <> 2 then raise exception 'FAIL fixes not logged'; end if;
  begin
    perform public.clock_fix('00000000-0000-0000-0000-0000000081d1', '00000000-0000-0000-0000-0000000081df', null, 'out', now() + interval '1 hour', 'forgot');
    raise exception 'FAIL future time allowed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select 'timesheet ok';
rollback;
