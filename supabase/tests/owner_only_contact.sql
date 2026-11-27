-- Only the owner gets a client's full phone + email from the server; a manager's hidden values still save,
-- look up and call correctly, and nobody borrows the owner's role. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fc01', '14085555001', 'authenticated', 'authenticated'),   -- owner
  ('00000000-0000-0000-0000-00000000fc02', '14085555002', 'authenticated', 'authenticated');   -- manager
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-00000000fc01');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000090a1', 'ownerName', 'Mai', 'salonName', 'Hide Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000909a', 'name', 'Bao', 'phone', '+14085555002', 'role', 'manager'))));
reset role;
insert into public.clients (id, salon_id, phone, name, email) values
  ('00000000-0000-0000-0000-0000000091c1', '00000000-0000-0000-0000-0000000090a1', '+16125557011', 'Lan Tran', 'lan@example.com');
set local role authenticated;

-- owner sees everything
insert into t_out values ('owner_list', (select public.client_list('00000000-0000-0000-0000-0000000090a1', 'all', '')->'rows'->0->'phone'));

-- manager: hidden everywhere
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc02","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values
  ('mgr_list', (select public.client_list('00000000-0000-0000-0000-0000000090a1', 'all', '')->'rows'->0->'phone')),
  ('mgr_profile', (select jsonb_build_object('p', x->'phone', 'e', x->'email') from public.client_profile('00000000-0000-0000-0000-0000000091c1') x)),
  ('mgr_contacts', public.ticket_contacts('00000000-0000-0000-0000-0000000090a1', array['00000000-0000-0000-0000-0000000091c1'::uuid])->0),
  ('mgr_search7', to_jsonb(jsonb_array_length(public.client_list('00000000-0000-0000-0000-0000000090a1', 'all', '6125557')->'rows'))),
  ('mgr_search3', to_jsonb(jsonb_array_length(public.client_list('00000000-0000-0000-0000-0000000090a1', 'all', '612')->'rows')));
do $$ begin
  begin perform phone from public.clients limit 1; insert into t_out values ('mgr_direct', 'true');
  exception when others then insert into t_out values ('mgr_direct', 'false'); end;
end $$;
-- a ticket saved with the hidden phone stays on the same client, no new client
select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000092d1', 'salonId', '00000000-0000-0000-0000-0000000090a1',
  'client', jsonb_build_object('id', '00000000-0000-0000-0000-0000000091c1', 'phone', '••7011', 'name', 'Lan Tran'), 'lines', '[]'::jsonb));
-- gift + loyalty lookups work with the hidden phone + client id
insert into t_out values ('mgr_gift', public.gift_find('00000000-0000-0000-0000-0000000090a1', '••7011', '00000000-0000-0000-0000-0000000091c1'));
-- receipt "on file": logged with the real number
select public.log_receipt('00000000-0000-0000-0000-0000000093e1', '00000000-0000-0000-0000-0000000090a1', '00000000-0000-0000-0000-0000000092d1', 'text', '••7011');
-- Call (manager is on by default) hands out the number; borrowing the owner's membership does not work
insert into t_out values ('mgr_call', public.client_contact_log('00000000-0000-0000-0000-0000000090a1', '00000000-0000-0000-0000-0000000091c1', null, 'call'));
do $$ begin
  begin perform public.client_contact_log('00000000-0000-0000-0000-0000000090a1', '00000000-0000-0000-0000-0000000091c1', null, 'call',
      (select id from public.memberships where salon_id = '00000000-0000-0000-0000-0000000090a1' and role = 'owner'));
    insert into t_out values ('mgr_as_owner', 'true');
  exception when others then insert into t_out values ('mgr_as_owner', 'false'); end;
end $$;
reset role;
insert into t_out values
  ('clients', to_jsonb((select count(*) from public.clients where salon_id = '00000000-0000-0000-0000-0000000090a1'))),
  ('ticket_client', to_jsonb((select client_id from public.tickets where id = '00000000-0000-0000-0000-0000000092d1'))),
  ('receipt_to', to_jsonb((select sent_to from public.receipts where id = '00000000-0000-0000-0000-0000000093e1')));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->>'owner_list' <> '+16125557011' then raise exception 'FAIL owner should see the full phone: %', o->'owner_list'; end if;
  if o->>'mgr_list' <> '••7011' then raise exception 'FAIL manager list phone: %', o->'mgr_list'; end if;
  if o->'mgr_profile'->>'p' <> '••7011' or o->'mgr_profile'->>'e' <> 'l•••@example.com' then raise exception 'FAIL manager profile: %', o->'mgr_profile'; end if;
  if o->'mgr_contacts'->>'phone' <> '••7011' then raise exception 'FAIL ticket_contacts: %', o->'mgr_contacts'; end if;
  if (o->>'mgr_search7')::int <> 1 or (o->>'mgr_search3')::int <> 0 then raise exception 'FAIL manager phone search 7=% 3=%', o->'mgr_search7', o->'mgr_search3'; end if;
  if (o->>'mgr_direct')::boolean then raise exception 'FAIL manager read clients.phone directly'; end if;
  if (o->>'clients')::int <> 1 then raise exception 'FAIL a hidden phone made a new client: %', o->'clients'; end if;
  if o->>'ticket_client' <> '00000000-0000-0000-0000-0000000091c1' then raise exception 'FAIL ticket client: %', o->'ticket_client'; end if;
  if jsonb_typeof(o->'mgr_gift') <> 'array' then raise exception 'FAIL gift lookup: %', o->'mgr_gift'; end if;
  if o->>'receipt_to' <> '+16125557011' then raise exception 'FAIL receipt to: %', o->'receipt_to'; end if;
  if o->'mgr_call'->>'phone' <> '+16125557011' then raise exception 'FAIL call number: %', o->'mgr_call'; end if;
  if (o->>'mgr_as_owner')::boolean then raise exception 'FAIL manager borrowed the owner membership'; end if;
  raise notice 'PASS owner_only_contact';
end $$;
rollback;
