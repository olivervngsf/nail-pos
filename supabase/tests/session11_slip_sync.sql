-- Ticket slip sync (Codex review): a service a tech removed on their phone stays removed after the desk saves its older copy;
-- a phone "$45+" line is price_open until the desk changes its price; a phone line the desk acked can be removed by the desk.
-- Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fc01', '14085552001', 'authenticated', 'authenticated'),   -- owner at the desk
  ('00000000-0000-0000-0000-00000000fc02', '14085552002', 'authenticated', 'authenticated');   -- Kim, tech
create temp table t_out (k text primary key, v jsonb);

-- Salons are invite-only (Nov 17): test users may create salons like a platform admin.
insert into public.platform_admins (auth_user_id) select id from auth.users where id::text like '00000000-0000-0000-0000-%' on conflict do nothing;
grant all on t_out to authenticated, anon;
create function pg_temp.desk(lines jsonb, seen jsonb) returns jsonb language sql as $$
  select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000060c1', 'salonId', '00000000-0000-0000-0000-0000000060a1',
    'lines', lines, 'seen', seen)) $$;
create function pg_temp.svc(id text, cents int) returns jsonb language sql as $$
  select jsonb_build_object('id', ('00000000-0000-0000-0000-0000000061' || id)::uuid, 'kind', 'service', 'staffId', '00000000-0000-0000-0000-00000000607a',
    'serviceId', '00000000-0000-0000-0000-0000000062b1', 'name', 'Gel manicure', 'minutes', 45, 'cents', cents) $$;
create function pg_temp.live(lid text) returns boolean language sql as $$
  select removed_at is null from public.ticket_lines where id = ('00000000-0000-0000-0000-0000000061' || lid)::uuid $$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000060a1', 'ownerName', 'Mai', 'salonName', 'Slip Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000607a', 'name', 'Kim', 'phone', '+14085552002', 'role', 'tech'))));
reset role;
insert into public.services (id, salon_id, category, name, minutes, price_cents, price_from) values
  ('00000000-0000-0000-0000-0000000062b1', '00000000-0000-0000-0000-0000000060a1', 'Manicure', 'Gel manicure', 45, 3500, false),
  ('00000000-0000-0000-0000-0000000062b2', '00000000-0000-0000-0000-0000000060a1', 'Art', 'Nail art', 30, 4500, true);
set local role authenticated;
-- desk opens the ticket with one service
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select pg_temp.desk(jsonb_build_array(pg_temp.svc('a1', 3500)), jsonb_build_array('00000000-0000-0000-0000-0000000061a1'));
-- Kim scans the slip, adds a gel + a "$45+" nail art
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc02","role":"authenticated"}', true);
select public.claim_memberships();
select public.tech_add_service('00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000061a2', '00000000-0000-0000-0000-0000000062b1');
select public.tech_add_service('00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000061a3', '00000000-0000-0000-0000-0000000062b2');
reset role;
insert into t_out values ('open_new', to_jsonb((select price_open from public.ticket_lines where id = '00000000-0000-0000-0000-0000000061a3')));
set local role authenticated;
-- desk pulls both in (ack), then Kim removes the gel on her phone
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select public.ack_ticket_lines('00000000-0000-0000-0000-0000000060c1', array['00000000-0000-0000-0000-0000000061a2', '00000000-0000-0000-0000-0000000061a3']::uuid[]);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc02","role":"authenticated"}', true);
select public.tech_remove_line('00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000061a2');
-- 1. desk saves its older copy (still has the gel) + sets the nail art's final price: gel stays removed, price no longer open
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select pg_temp.desk(jsonb_build_array(pg_temp.svc('a1', 3500), pg_temp.svc('a2', 3500), pg_temp.svc('a3', 5500)),
  jsonb_build_array('00000000-0000-0000-0000-0000000061a1', '00000000-0000-0000-0000-0000000061a2', '00000000-0000-0000-0000-0000000061a3'));
insert into t_out values ('gel_back', to_jsonb(pg_temp.live('a2')));
reset role;
insert into t_out values ('open_after', to_jsonb((select price_open from public.ticket_lines where id = '00000000-0000-0000-0000-0000000061a3')));
insert into t_out values ('sub', to_jsonb((select subtotal_cents from public.tickets where id = '00000000-0000-0000-0000-0000000060c1')));
set local role authenticated;
-- 2. the desk removes the acked phone line (nail art): allowed
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select pg_temp.desk(jsonb_build_array(pg_temp.svc('a1', 3500)),
  jsonb_build_array('00000000-0000-0000-0000-0000000061a1', '00000000-0000-0000-0000-0000000061a2', '00000000-0000-0000-0000-0000000061a3'));
insert into t_out values ('art_live', to_jsonb(pg_temp.live('a3')));
-- desk lines still come back with the desk's undo (only tech removals are sticky)
select pg_temp.desk(jsonb_build_array(pg_temp.svc('a1', 3500), pg_temp.svc('a3', 5500)),
  jsonb_build_array('00000000-0000-0000-0000-0000000061a1', '00000000-0000-0000-0000-0000000061a3'));
insert into t_out values ('art_undo', to_jsonb(pg_temp.live('a3')));
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if (o->>'open_new')::boolean is not true then raise exception 'FAIL phone $45+ line should be price_open'; end if;
  if (o->>'gel_back')::boolean then raise exception 'FAIL tech-removed line came back after a desk save'; end if;
  if (o->>'open_after')::boolean then raise exception 'FAIL price_open should clear when the desk sets the price'; end if;
  if (o->>'sub')::int <> 9000 then raise exception 'FAIL subtotal should skip the removed gel: %', o->'sub'; end if;
  if (o->>'art_live')::boolean then raise exception 'FAIL desk could not remove an acked phone line'; end if;
  if (o->>'art_undo')::boolean is not true then raise exception 'FAIL desk undo of its own removal'; end if;
  raise notice 'PASS session11_slip_sync';
end $$;
rollback;
