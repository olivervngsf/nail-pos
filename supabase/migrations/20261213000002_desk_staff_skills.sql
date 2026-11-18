-- Tech skills on the desk (Nov 18): desk_staff also returns each person's skills (ticked in Settings → Team),
-- so booking + seating show who's good at the picked services. Facts only; the desk still decides.
drop function public.desk_staff(uuid);
create function public.desk_staff(p_salon uuid)
returns table(membership_id uuid, display_name text, role public.member_role, clocked_in boolean, turns_today integer, cents_today bigint, pin_len smallint, skills text[])
language sql stable security definer set search_path = '' as $$
  with day as (
    select (date_trunc('day', now() at time zone s.time_zone) at time zone s.time_zone) as start from public.salons s where s.id = p_salon
  )
  select m.id, m.display_name, m.role,
    coalesce((select ce.kind = 'in' from public.clock_events ce where ce.membership_id = m.id order by ce.at desc limit 1), false),
    (select count(distinct l.ticket_id)::int from public.ticket_lines l join public.tickets t on t.id = l.ticket_id
       where l.staff_id = m.id and l.kind = 'service' and l.removed_at is null and t.status <> 'voided' and t.created_at >= (select start from day)),
    (select coalesce(sum(l.amount_cents), 0)::bigint from public.ticket_lines l join public.tickets t on t.id = l.ticket_id
       where l.staff_id = m.id and l.kind = 'service' and l.removed_at is null and t.status = 'paid' and t.created_at >= (select start from day)),
    m.pin_len,
    m.skills
  from public.memberships m
  where m.salon_id = p_salon and m.archived_at is null and public.is_member(p_salon)
  order by (m.role = 'tech') desc, m.display_name;
$$;
revoke execute on function public.desk_staff(uuid) from public, anon;
grant execute on function public.desk_staff(uuid) to authenticated;
