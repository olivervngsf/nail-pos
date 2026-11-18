-- Techs see only their part (Nov 18).
-- Before: any member (incl. techs, on their own phone login) could read every booking and every
-- client's full phone number (appt_list, client_list, client_profile, direct table reads).
-- Now: desk roles (owner, manager, front desk) keep the full view; a tech gets
--   * appt_list: own bookings only, no client phone (same as my_appts)
--   * client_list / client_profile: phone shown as last 4 only (••1234); phone search needs the exact last 4
--   * tables clients / appointments: no direct read (appointments: own rows only)

-- Phone as this caller may see it: full for desk roles, last 4 for everyone else.
create or replace function public._viewer_phone(p_salon uuid, p_phone text) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_phone is null or p_phone = '' then coalesce(p_phone, '')
              when public._is_desk(p_salon) then p_phone
              else '••' || right(regexp_replace(p_phone, '\D', '', 'g'), 4) end;
$$;
revoke execute on function public._viewer_phone(uuid, text) from public, anon;
grant execute on function public._viewer_phone(uuid, text) to authenticated;

-- Desk calendar list: techs get own bookings only, no phones.
create or replace function public.appt_list(p_salon uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (
    select public._is_desk(p_salon) as desk,
      (select m.id from public.memberships m where m.salon_id = p_salon and m.person_id = public.my_person_id() and m.archived_at is null) as mid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'start', a.start_at, 'end', a.end_at, 'staffId', a.staff_id, 'status', a.status, 'source', a.source, 'note', a.note,
    'services', a.services, 'ticketId', a.ticket_id, 'repeatRuleId', a.repeat_rule_id, 'updatedAt', a.updated_at,
    'arrivedAt', a.arrived_at, 'seatReason', a.seat_reason,
    'client', case when a.client_id is null then jsonb_build_object('name', a.client_name, 'phone', '')
              else jsonb_build_object('id', c.id, 'name', coalesce(nullif(c.name, ''), a.client_name),
                'phone', case when me.desk then c.phone else '' end, 'care', c.care <> '', 'textsOk', c.texts_ok) end,
    'ticketStatus', (select t.status from public.tickets t where t.id = a.ticket_id)
  ) order by a.start_at), '[]'::jsonb)
  from me, public.appointments a left join public.clients c on c.id = a.client_id
  where a.salon_id = p_salon and public.is_member(p_salon) and a.start_at < p_to and a.end_at > p_from
    and (me.desk or a.staff_id = me.mid);
$$;

-- client_list + client_profile: same functions, phone through _viewer_phone.
-- Rewritten from their current text so nothing else in them changes; fails loudly if the text moved.
do $mig$
declare d text; n text;
begin
  select pg_get_functiondef('public.client_profile(uuid)'::regprocedure) into d;
  n := replace(d, $s$'phone', c.phone,$s$, $s$'phone', public._viewer_phone(c.salon_id, c.phone),$s$);
  if n = d then raise exception 'client_profile: phone line not found'; end if;
  execute n;

  select pg_get_functiondef('public.client_list(uuid, text, text)'::regprocedure) into d;
  n := replace(d, $s$'phone', phone,$s$, $s$'phone', public._viewer_phone(p_salon, phone),$s$);
  if n = d then raise exception 'client_list: phone line not found'; end if;
  d := n;
  n := replace(d, $s$like '%' || digits || '%'))$s$,
    $s$like '%' || digits || '%' and (public._is_desk(p_salon) or (length(digits) = 4 and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 4) = digits))))$s$);
  if n = d then raise exception 'client_list: phone search not found'; end if;
  execute n;
end $mig$;

-- Direct table reads: clients = desk only; appointments = desk, or a tech's own rows.
drop policy if exists "members read" on public.clients;
create policy "desk read" on public.clients for select to authenticated using (public._is_desk(salon_id));

drop policy if exists "members read" on public.appointments;
create policy "desk or own read" on public.appointments for select to authenticated using (
  public._is_desk(salon_id) or staff_id in (
    select m.id from public.memberships m where m.person_id = public.my_person_id() and m.archived_at is null));
