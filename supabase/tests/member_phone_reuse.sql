-- Add a member, remove them, add the same phone again: works. Two active members with one phone: still refused. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fe01', '14085550931', 'authenticated', 'authenticated');
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-00000000fe01') on conflict do nothing;  -- salons are invite-only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000082a1', 'ownerName', 'Mai', 'salonName', 'Reuse Nails', 'state', 'CA', 'step', 2,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000827f', 'name', 'Kim', 'phone', '+14085550932', 'role', 'tech'))));
-- remove Kim
select public.team_archive('00000000-0000-0000-0000-00000000827f');
-- add Kim's phone again as a new member
do $$ begin
  perform public.team_save(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000082a1', 'name', 'Kim again', 'phone', '+14085550932', 'role', 'tech'));
exception when others then raise exception 'FAIL re-adding a removed phone: %', sqlerrm; end $$;
do $$ begin
  if (select count(*) from public.memberships where salon_id = '00000000-0000-0000-0000-0000000082a1' and phone = '+14085550932') <> 2 then
    raise exception 'FAIL expected old (removed) + new row'; end if;
  if (select count(*) from public.memberships where salon_id = '00000000-0000-0000-0000-0000000082a1' and phone = '+14085550932' and archived_at is null) <> 1 then
    raise exception 'FAIL expected one active row'; end if;
end $$;
-- a second active member with the same phone is still refused
do $$ begin
  perform public.team_save(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000082a1', 'name', 'Kim twin', 'phone', '+14085550932', 'role', 'tech'));
  raise exception 'FAIL two active members share a phone';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; end $$;
rollback;
