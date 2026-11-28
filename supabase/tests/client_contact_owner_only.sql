-- Client phone + email = owner only (Oliver, Nov 26). Owner gets them in full; manager + front desk get ••7011 /
-- mari•••@gmail.com; the clients table hands them to nobody directly; a hidden value sent back never overwrites the real
-- one; the calendar's hidden `dial` goes only to roles the owner turned Call/Text on for. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fd01', '14085557001', 'authenticated', 'authenticated'),   -- owner
  ('00000000-0000-0000-0000-00000000fd02', '14085557002', 'authenticated', 'authenticated'),   -- manager
  ('00000000-0000-0000-0000-00000000fd03', '14085557003', 'authenticated', 'authenticated');   -- front desk
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-00000000fd01');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000081a1', 'ownerName', 'Mai', 'salonName', 'Hide Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000818a', 'name', 'Bao', 'phone', '+14085557002', 'role', 'manager'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000818b', 'name', 'Hanh', 'phone', '+14085557003', 'role', 'front_desk'))));
-- Call / Text on for the manager only.
select public.contact_settings_save('00000000-0000-0000-0000-0000000081a1', '{"call":["manager"],"text":[]}');
reset role;
insert into public.clients (id, salon_id, phone, name, email) values
  ('00000000-0000-0000-0000-0000000081c1', '00000000-0000-0000-0000-0000000081a1', '+14085557011', 'Maria Gonzalez', 'maria@example.com');
insert into public.appointments (id, salon_id, client_id, client_name, start_at, end_at, services, status, source)
  values ('00000000-0000-0000-0000-0000000081e1', '00000000-0000-0000-0000-0000000081a1', '00000000-0000-0000-0000-0000000081c1', 'Maria Gonzalez',
          now() + interval '1 day', now() + interval '1 day 1 hour', '[]', 'booked', 'desk');
set local role authenticated;

-- owner
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
insert into t_out values ('own_prof', public.client_profile('00000000-0000-0000-0000-0000000081c1'));
insert into t_out values ('own_appt', public.appt_list('00000000-0000-0000-0000-0000000081a1', now(), now() + interval '3 days')->0->'client');

-- manager (Call allowed)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd02","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('mgr_prof', public.client_profile('00000000-0000-0000-0000-0000000081c1'));
insert into t_out values ('mgr_appt', public.appt_list('00000000-0000-0000-0000-0000000081a1', now(), now() + interval '3 days')->0->'client');
insert into t_out values ('mgr_ticket', public.ticket_clients('00000000-0000-0000-0000-0000000081a1', array['00000000-0000-0000-0000-0000000081c1'::uuid])->0);

-- front desk (Call/Text off): hidden, no dial, and no direct read of the phone column
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd03","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('desk_appt', public.appt_list('00000000-0000-0000-0000-0000000081a1', now(), now() + interval '3 days')->0->'client');
do $$ begin
  begin perform phone from public.clients limit 1; insert into t_out values ('desk_read', 'true');
  exception when insufficient_privilege then insert into t_out values ('desk_read', 'false'); end;
end $$;
-- the desk saves the booking back with the hidden number: the real one stays
select public.appt_save(jsonb_build_object('id', '00000000-0000-0000-0000-0000000081e1', 'salonId', '00000000-0000-0000-0000-0000000081a1',
  'start', now() + interval '1 day', 'end', now() + interval '1 day 1 hour', 'status', 'confirmed', 'services', '[]'::jsonb, 'updatedAt', now(),
  'client', jsonb_build_object('id', '00000000-0000-0000-0000-0000000081c1', 'phone', '••7011', 'name', 'Maria Gonzalez')));
reset role;
insert into t_out values
  ('real_phone', to_jsonb((select phone from public.clients where id = '00000000-0000-0000-0000-0000000081c1'))),
  ('appt_client', to_jsonb((select client_id from public.appointments where id = '00000000-0000-0000-0000-0000000081e1'))),
  ('masked_rows', to_jsonb((select count(*) from public.clients where phone like '%•%' or email like '%•%')));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->'own_prof'->>'phone' <> '+14085557011' or o->'own_prof'->>'email' <> 'maria@example.com' then raise exception 'FAIL owner profile: %', o->'own_prof'; end if;
  if o->'own_appt'->>'phone' <> '+14085557011' then raise exception 'FAIL owner calendar: %', o->'own_appt'; end if;
  if o->'mgr_prof'->>'phone' <> '••7011' or o->'mgr_prof'->>'email' <> 'mari•••@example.com' then raise exception 'FAIL manager profile: %', o->'mgr_prof'; end if;
  if o->'mgr_appt'->>'phone' <> '••7011' or o->'mgr_appt'->>'dial' <> '+14085557011' then raise exception 'FAIL manager calendar: %', o->'mgr_appt'; end if;
  if o->'mgr_ticket'->>'phone' <> '••7011' or o->'mgr_ticket'->>'email' <> 'mari•••@example.com' then raise exception 'FAIL manager ticket: %', o->'mgr_ticket'; end if;
  if o->'desk_appt'->>'phone' <> '••7011' or o->'desk_appt' ? 'dial' and o->'desk_appt'->>'dial' is not null then raise exception 'FAIL desk calendar: %', o->'desk_appt'; end if;
  if (o->>'desk_read')::boolean then raise exception 'FAIL desk read the phone column directly'; end if;
  if o->>'real_phone' <> '+14085557011' then raise exception 'FAIL hidden number overwrote the real one: %', o->'real_phone'; end if;
  if o->>'appt_client' <> '00000000-0000-0000-0000-0000000081c1' then raise exception 'FAIL booking lost its client: %', o->'appt_client'; end if;
  if (o->>'masked_rows')::int <> 0 then raise exception 'FAIL a hidden value was saved'; end if;
  raise notice 'PASS client_contact_owner_only';
end $$;
rollback;
