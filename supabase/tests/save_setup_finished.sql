-- Old setup saves: a phone already on the team no longer fails the save (during setup);
-- once setup is finished the wizard can't change or archive staff and services. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values ('00000000-0000-0000-0000-00000000fc01', '14085550901', 'authenticated', 'authenticated');
insert into public.platform_admins (auth_user_id) select id from auth.users where id = '00000000-0000-0000-0000-00000000fc01' on conflict do nothing;  -- salons are invite-only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
-- during setup (step 2): Kim
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000080a1', 'ownerName', 'Mai', 'salonName', 'Setup Nails', 'state', 'CA', 'step', 2,
  'services', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000080e1', 'cat', 'Gel', 'name', 'Gel mani', 'minutes', 45, 'priceCents', 4500, 'on', true)),
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000807f', 'name', 'Kim', 'phone', '+14085550902', 'role', 'tech'))));
-- same phone under a new id (used to fail with a duplicate key) + a new person; finishes setup (step 9)
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000080a1', 'step', 9,
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000808f', 'name', 'Kim again', 'phone', '+14085550902', 'role', 'manager'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000809f', 'name', 'Tuyet', 'phone', '+14085550903', 'role', 'tech'))));
-- finished: an old save with other staff + services changes nothing there, but salon info still saves
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000080a1', 'salonName', 'Setup Nails 2', 'step', 9,
  'services', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000080e2', 'cat', 'Gel', 'name', 'Old one', 'minutes', 30, 'priceCents', 100, 'on', true)),
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000080af', 'name', 'Stale', 'phone', '+14085550904', 'role', 'tech'))));
reset role;
do $$
declare s uuid := '00000000-0000-0000-0000-0000000080a1';
begin
  if (select count(*) from public.memberships where salon_id = s and phone = '+14085550902') <> 1
    or (select display_name || role::text from public.memberships where salon_id = s and phone = '+14085550902') <> 'Kimtech' then raise exception 'FAIL same phone: member changed or doubled'; end if;
  if (select count(*) from public.memberships where salon_id = s and archived_at is null) <> 3 then raise exception 'FAIL expected owner + Kim + Tuyet, got %', (select count(*) from public.memberships where salon_id = s and archived_at is null); end if;
  if exists (select 1 from public.memberships where salon_id = s and phone = '+14085550904') then raise exception 'FAIL finished salon took staff from an old setup save'; end if;
  if (select count(*) from public.services where salon_id = s and archived_at is null) <> 1 or exists (select 1 from public.services where salon_id = s and name = 'Old one') then raise exception 'FAIL finished salon menu changed by an old setup save'; end if;
  if (select name from public.salons where id = s) <> 'Setup Nails 2' then raise exception 'FAIL salon info should still save'; end if;
end $$;
select 'save_setup_finished ok' as result;
rollback;
