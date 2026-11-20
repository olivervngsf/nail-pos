-- A new PIN link ends the older one at once (was 'now()', which still counted as open inside the same moment).
create or replace function public.pin_link_make(p_membership uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare m record; c text;
begin
  select id, salon_id, role, person_id, archived_at into m from public.memberships where id = p_membership;
  if m.id is null or not public.is_admin(m.salon_id) then raise exception 'not allowed'; end if;
  if m.role = 'owner' and not public.is_owner(m.salon_id) then raise exception 'not allowed'; end if;
  if m.archived_at is not null then raise exception 'removed from the team'; end if;
  if m.person_id is null then raise exception 'not joined yet'; end if;
  update public.pin_links set expires_at = least(expires_at, now() - interval '1 second') where membership_id = p_membership and used_at is null;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.pin_links (code, salon_id, membership_id, made_by) values (c, m.salon_id, p_membership, public.my_person_id());
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (m.salon_id, public.my_person_id(), 'pin.link', jsonb_build_object('membership', p_membership));
  return c;
end $$;

