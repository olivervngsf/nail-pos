-- Tech app (M13, Nov 18): a tech's phone shows only their own bookings. No client phone numbers here.
create or replace function public.my_appts(p_salon uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare mid uuid;
begin
  select m.id into mid from public.memberships m
  where m.salon_id = p_salon and m.person_id = public.my_person_id() and m.archived_at is null;
  if mid is null then raise exception 'not a member'; end if;
  if p_to <= p_from or p_to - p_from > interval '45 days' then raise exception 'pick up to 45 days'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'start', a.start_at, 'end', a.end_at, 'staffId', a.staff_id, 'status', a.status, 'source', a.source,
      'note', a.note, 'services', a.services, 'ticketId', a.ticket_id, 'updatedAt', a.updated_at, 'arrivedAt', a.arrived_at,
      'client', jsonb_build_object('id', c.id, 'name', coalesce(nullif(c.name, ''), a.client_name), 'phone', '', 'care', coalesce(c.care, '') <> ''),
      'ticketStatus', (select t.status from public.tickets t where t.id = a.ticket_id)
    ) order by a.start_at)
    from public.appointments a left join public.clients c on c.id = a.client_id
    where a.salon_id = p_salon and a.staff_id = mid and a.start_at < p_to and a.end_at > p_from), '[]'::jsonb);
end $$;

revoke execute on function public.my_appts(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.my_appts(uuid, timestamptz, timestamptz) to authenticated;
