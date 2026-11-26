-- Techs add upsells themselves (any menu service or a custom item); every add / remove is in audit_log; lines carry added_at.
-- A tech can't add to a paid ticket, can't add a bad custom item, and can't remove another tech's line. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fd01', '14085553001', 'authenticated', 'authenticated'),   -- owner at the desk
  ('00000000-0000-0000-0000-00000000fd02', '14085553002', 'authenticated', 'authenticated'),   -- Kim, tech
  ('00000000-0000-0000-0000-00000000fd03', '14085553003', 'authenticated', 'authenticated');   -- Lan, tech
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000070a1', 'ownerName', 'Mai', 'salonName', 'Upsell Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000707a', 'name', 'Kim', 'phone', '+14085553002', 'role', 'tech'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000707b', 'name', 'Lan', 'phone', '+14085553003', 'role', 'tech'))));
reset role;
insert into public.services (id, salon_id, category, name, minutes, price_cents, price_from) values
  ('00000000-0000-0000-0000-0000000072b1', '00000000-0000-0000-0000-0000000070a1', 'Manicure', 'Gel manicure', 45, 3500, false);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000070c1', 'salonId', '00000000-0000-0000-0000-0000000070a1', 'lines', '[]'::jsonb));

-- Kim adds a menu service + a custom item
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd02","role":"authenticated"}', true);
select public.claim_memberships();
select public.tech_add_service('00000000-0000-0000-0000-0000000070c1', '00000000-0000-0000-0000-0000000071a1', '00000000-0000-0000-0000-0000000072b1');
select public.tech_add_service('00000000-0000-0000-0000-0000000070c1', '00000000-0000-0000-0000-0000000071a1', '00000000-0000-0000-0000-0000000072b1'); -- same line again: once
select public.tech_add_custom('00000000-0000-0000-0000-0000000070c1', '00000000-0000-0000-0000-0000000071a2', '  Chrome powder  ', 1500, 10);
do $$ begin
  begin perform public.tech_add_custom('00000000-0000-0000-0000-0000000070c1', gen_random_uuid(), '', 1500, 10);
    insert into t_out values ('empty_ok', 'true'); exception when others then insert into t_out values ('empty_ok', 'false'); end;
  begin perform public.tech_add_custom('00000000-0000-0000-0000-0000000070c1', gen_random_uuid(), 'Gold', 500000, 10);
    insert into t_out values ('huge_ok', 'true'); exception when others then insert into t_out values ('huge_ok', 'false'); end;
end $$;
-- Lan tries to remove Kim's custom item: nothing happens
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd03","role":"authenticated"}', true);
select public.claim_memberships();
select public.tech_remove_line('00000000-0000-0000-0000-0000000070c1', '00000000-0000-0000-0000-0000000071a2');
-- Kim removes her gel
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd02","role":"authenticated"}', true);
select public.tech_remove_line('00000000-0000-0000-0000-0000000070c1', '00000000-0000-0000-0000-0000000071a1');
reset role;

insert into t_out values
  ('custom', (select to_jsonb(l) from (select name, amount_cents, minutes, source, service_id, added_at is not null as stamped, removed_at is null as live
     from public.ticket_lines where id = '00000000-0000-0000-0000-0000000071a2') l)),
  ('added', to_jsonb((select count(*) from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000070a1' and action = 'ticket.tech_added'))),
  ('removed', to_jsonb((select count(*) from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000070a1' and action = 'ticket.tech_removed'))),
  ('who', to_jsonb((select p.auth_user_id from public.audit_log a join public.people p on p.id = a.person_id
     where a.salon_id = '00000000-0000-0000-0000-0000000070a1' and a.action = 'ticket.tech_removed' limit 1))),
  ('sub', to_jsonb((select subtotal_cents from public.tickets where id = '00000000-0000-0000-0000-0000000070c1')));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->'custom'->>'name' <> 'Chrome powder' or (o->'custom'->>'amount_cents')::int <> 1500 or o->'custom'->>'source' <> 'phone'
     or o->'custom'->>'service_id' is not null or (o->'custom'->>'stamped')::boolean is not true then raise exception 'FAIL custom item: %', o->'custom'; end if;
  if (o->'custom'->>'live')::boolean is not true then raise exception 'FAIL another tech removed Kim''s line'; end if;
  if (o->>'empty_ok')::boolean then raise exception 'FAIL empty custom name allowed'; end if;
  if (o->>'huge_ok')::boolean then raise exception 'FAIL $5,000 custom item allowed'; end if;
  if (o->>'added')::int <> 2 then raise exception 'FAIL expected 2 tech_added rows (same line twice = once): %', o->'added'; end if;
  if (o->>'removed')::int <> 1 then raise exception 'FAIL expected 1 tech_removed row (Lan''s try logs nothing): %', o->'removed'; end if;
  if o->>'who' <> '00000000-0000-0000-0000-00000000fd02' then raise exception 'FAIL removal logged under the wrong person: %', o->'who'; end if;
  if (o->>'sub')::int <> 1500 then raise exception 'FAIL subtotal should be the custom item only: %', o->'sub'; end if;
  raise notice 'PASS tech_upsell_log';
end $$;
rollback;
