-- Profile pop-up "My time today" (board Settings · Profile pop-up B + C): minutes clocked in today for one person.
-- Own login: your own membership (p_membership null or yours). Salon device / owner / manager: anyone in that salon
-- (the faces screen already shows who is clocked in). Counts an open clock-in up to now.
create function public.my_time_today(p_salon uuid, p_membership uuid default null)
returns table (minutes int, clocked_in boolean, since timestamptz)
language sql stable security definer set search_path = public as $$
  with who as (
    select m.id from public.memberships m
     where m.salon_id = p_salon
       and m.id = coalesce(p_membership, (select x.id from public.memberships x where x.salon_id = p_salon and x.person_id = public.my_person_id() limit 1))
       and (m.person_id = public.my_person_id() or public._is_desk(p_salon) or public.is_admin(p_salon))
  ), day as (
    select (date_trunc('day', now() at time zone s.time_zone)) at time zone s.time_zone f from public.salons s where s.id = p_salon
  ), ev as (
    select c.kind, c.at, lead(c.at) over (order by c.at) nxt, lead(c.kind) over (order by c.at) nk
      from public.clock_events c, day
     where c.membership_id = (select id from who) and c.at >= day.f and c.at <= now()
  )
  select coalesce(sum(extract(epoch from (case when nk = 'out' then nxt when nxt is null then now() end) - at) / 60) filter (where kind = 'in' and (nk = 'out' or nxt is null)), 0)::int,
         coalesce((select kind = 'in' from ev order by at desc limit 1), false),
         (select min(at) from ev where kind = 'in')
    from ev
   where exists (select 1 from who);
$$;
revoke all on function public.my_time_today(uuid, uuid) from public, anon;
grant execute on function public.my_time_today(uuid, uuid) to authenticated;
