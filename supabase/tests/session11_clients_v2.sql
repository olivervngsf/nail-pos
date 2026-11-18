-- Clients v2 (version D) + client number: care note author (any staff), private note (owner/manager only, techs can't read it even
-- straight from the table), "Show phone" logged for owner/manager only, points on the profile. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000ef01', '14085550601', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ef02', '14085550602', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only: test owners set up salons as platform admins
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ef01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000011a1', 'ownerName', 'Mai', 'salonName', 'V2 Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000117f', 'name', 'Kim', 'phone', '+14085550602', 'role', 'tech'))));
create temp table t_c as select public.client_save(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000011a1', 'name', 'Lan Tran', 'phone', '+14085550142')) as id;
grant all on t_c to authenticated;
select public.client_set_private(id, 'Asked twice for a discount; owner said no.') from t_c;
-- client numbers: random 5 digits per salon; "#<number>" finds that client
create temp table t_j as select public.client_save(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000011a1', 'name', 'Jen Park', 'phone', '+14085550131')) as id;
insert into t_out select 'by_number', public.client_list('00000000-0000-0000-0000-0000000011a1', 'all', '#' || c.number) from public.clients c join t_j on t_j.id = c.id;
-- a client with no phone: a ticket still links to them (by id) and keeps the name; a walk-in name stays on the ticket
create temp table t_np as select public.client_save(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000011a1', 'name', 'No Phone')) as id;
select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000011b1', 'salonId', '00000000-0000-0000-0000-0000000011a1',
  'client', jsonb_build_object('id', (select id from t_np), 'phone', '', 'name', 'No Phone'), 'lines', '[]'::jsonb));
select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000011b2', 'salonId', '00000000-0000-0000-0000-0000000011a1',
  'client', jsonb_build_object('phone', '', 'name', 'Walk-in Nam'), 'lines', '[]'::jsonb));
insert into t_out values ('np_ticket', (select to_jsonb(t) from public.tickets t where t.id = '00000000-0000-0000-0000-0000000011b1'));
insert into t_out values ('walkin_ticket', (select to_jsonb(t) from public.tickets t where t.id = '00000000-0000-0000-0000-0000000011b2'));
select public.client_phone_viewed(id) from t_c;
insert into t_out select 'owner', public.client_profile(id) from t_c;

-- tech: sets the care note, can't read or write the private note, can't log a phone view
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ef02","role":"authenticated"}', true);
select public.claim_memberships();
select public.client_set_care(id, 'Sensitive skin, no strong acetone') from t_c;
do $$ begin perform public.client_set_private((select id from t_c), 'x');
  raise exception 'FAIL: tech wrote private note'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
do $$ begin perform public.client_phone_viewed((select id from t_c));
  raise exception 'FAIL: tech logged phone view'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
insert into t_out values ('tech_rows', to_jsonb((select count(*) from public.client_private)));
insert into t_out select 'tech', public.client_profile(id) from t_c;
reset role;
insert into t_out values ('log', to_jsonb((select count(*) from public.audit_log where action = 'client.phone_viewed' and salon_id = '00000000-0000-0000-0000-0000000011a1')));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->'owner'->'private_note'->>'body' <> 'Asked twice for a discount; owner said no.' or o->'owner'->'private_note'->>'by' <> 'Mai'
     or (o->'owner'->>'can_edit')::boolean is not true then raise exception 'FAIL owner profile: %', o->'owner'; end if;
  if (o->'tech') ? 'private_note' and o->'tech'->'private_note' <> 'null'::jsonb then raise exception 'FAIL tech sees private note: %', o->'tech'->'private_note'; end if;
  if (o->'tech'->>'can_edit')::boolean then raise exception 'FAIL tech can_edit'; end if;
  if (o->>'tech_rows')::int <> 0 then raise exception 'FAIL tech reads client_private'; end if;
  if o->'tech'->>'care' <> 'Sensitive skin, no strong acetone' or o->'tech'->>'care_by' <> 'Kim' or o->'tech'->>'care_at' is null then raise exception 'FAIL care author: %', o->'tech'; end if;
  if (o->>'log')::int <> 1 then raise exception 'FAIL phone view log'; end if;
  if o->'tech'->'points' is null then raise exception 'FAIL points'; end if;
  if (o->'owner'->>'number')::int not between 10000 and 99999 then raise exception 'FAIL client number: %', o->'owner'->>'number'; end if;
  if jsonb_array_length(o->'by_number'->'rows') <> 1 or o->'by_number'->'rows'->0->>'name' <> 'Jen Park' then raise exception 'FAIL search by number: %', o->'by_number'; end if;
  if o->'np_ticket'->>'client_id' <> (select id::text from t_np) or o->'np_ticket'->>'client_name' <> 'No Phone' then raise exception 'FAIL no-phone ticket: %', o->'np_ticket'; end if;
  if o->'walkin_ticket'->>'client_id' is not null or o->'walkin_ticket'->>'client_name' <> 'Walk-in Nam' then raise exception 'FAIL walk-in name: %', o->'walkin_ticket'; end if;
  raise notice 'PASS session11_clients_v2';
end $$;
rollback;
