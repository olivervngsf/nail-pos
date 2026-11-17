-- Session 8 (M9) walk-ins + turns in SQL: a kiosk walk-in waits, the desk seats it with a tech (reason kept, came-in time kept),
-- another walks out (recorded, its time is free again), turns per tech = that day's tickets, a tech can't seat,
-- another salon sees nothing. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fd01', '14085550801', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fd02', '14085550802', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fd03', '14085550803', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
-- Fixed time: today at noon in the salon's time zone (so the test never straddles midnight).
create function pg_temp.t0() returns timestamptz language sql stable as $$ select (date_trunc('day', now() at time zone 'America/Los_Angeles') + interval '12 hours') at time zone 'America/Los_Angeles' $$;
create function pg_temp.walk(id text, ago text, extra jsonb default '{}') returns jsonb language sql as $$
  select public.appt_save(jsonb_build_object('id', ('00000000-0000-0000-0000-0000000030' || id)::uuid, 'salonId', '00000000-0000-0000-0000-0000000030a1',
    'start', pg_temp.t0() - ago::interval, 'end', pg_temp.t0() - ago::interval + interval '45 minutes',
    'client', jsonb_build_object('phone', '+1408555' || lpad(id, 4, '0'), 'name', 'Walk ' || id),
    'services', jsonb_build_array(jsonb_build_object('name', 'Gel manicure', 'minutes', 45, 'cents', 4500)), 'source', 'kiosk', 'note', 'B' || id,
    'updatedAt', now()) || extra) $$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000030a1', 'ownerName', 'Mai', 'salonName', 'Turn Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000307a', 'name', 'Kim', 'phone', '+14085550802', 'role', 'tech'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000307b', 'name', 'Tuyet', 'phone', '+14085550804', 'role', 'tech'))));

-- two walk-ins waiting (came 20 and 10 min ago)
select pg_temp.walk('b1', '20 minutes');
select pg_temp.walk('b2', '10 minutes');
-- seat b1 with Kim (desk skipped Tuyet: client asked) + open her ticket
select pg_temp.walk('b1', '0 minutes', jsonb_build_object('status', 'arrived', 'staffId', '00000000-0000-0000-0000-00000000307a',
  'arrivedAt', pg_temp.t0() - interval '20 minutes', 'seatReason', 'Client asked', 'ticketId', '00000000-0000-0000-0000-0000000030c1'));
select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000030c1', 'salonId', '00000000-0000-0000-0000-0000000030a1',
  'lines', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'kind', 'service', 'staffId', '00000000-0000-0000-0000-00000000307a', 'name', 'Gel manicure', 'minutes', 45, 'cents', 4500))));
-- b2 walks out
select pg_temp.walk('b2', '10 minutes', jsonb_build_object('status', 'walked_out', 'end', pg_temp.t0()));
insert into t_out values ('list', public.appt_list('00000000-0000-0000-0000-0000000030a1', pg_temp.t0() - interval '1 day', pg_temp.t0() + interval '1 day'));
insert into t_out values ('day', public.walkin_day('00000000-0000-0000-0000-0000000030a1', (now() at time zone 'America/Los_Angeles')::date));
insert into t_out values ('turns', (select jsonb_object_agg(display_name, turns_today) from public.desk_staff('00000000-0000-0000-0000-0000000030a1') where role = 'tech'));

-- tech: reads, can't seat
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd02","role":"authenticated"}', true);
select public.claim_memberships();
do $$ begin perform pg_temp.walk('b3', '1 minute');
  raise exception 'FAIL: tech added a walk-in'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
-- stranger
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd03","role":"authenticated"}', true);
insert into t_out values ('stranger', coalesce(public.walkin_day('00000000-0000-0000-0000-0000000030a1', current_date), 'null'));
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out); b1 jsonb; b2 jsonb;
begin
  select x into b1 from jsonb_array_elements(o->'list') x where x->'client'->>'name' = 'Walk b1';
  select x into b2 from jsonb_array_elements(o->'list') x where x->'client'->>'name' = 'Walk b2';
  if b1->>'status' <> 'arrived' or b1->>'seatReason' <> 'Client asked' or b1->>'staffId' <> '00000000-0000-0000-0000-00000000307a'
     or abs(extract(epoch from (b1->>'arrivedAt')::timestamptz - (pg_temp.t0() - interval '20 minutes'))) > 5 then raise exception 'FAIL seat: %', b1; end if;
  if b2->>'status' <> 'walked_out' then raise exception 'FAIL walk-out: %', b2; end if;
  if (o->'day'->>'walkIns')::int <> 2 or (o->'day'->>'seated')::int <> 1 or (o->'day'->>'walkedOut')::int <> 1 or (o->'day'->>'waiting')::int <> 0
     or (o->'day'->>'avgWaitMin')::int <> 20 or (o->'day'->>'longestWaitMin')::int <> 20 then raise exception 'FAIL day: %', o->'day'; end if;
  if (o->'turns'->>'Kim')::int <> 1 or (o->'turns'->>'Tuyet')::int <> 0 then raise exception 'FAIL turns: %', o->'turns'; end if;
  if o->'stranger' <> 'null'::jsonb then raise exception 'FAIL wall: %', o->'stranger'; end if;
  raise notice 'PASS session8_turns';
end $$;
rollback;
