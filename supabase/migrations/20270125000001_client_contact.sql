-- Call / Text a client without showing the number (Oliver, Nov 26): only the owner sees a client's full phone;
-- the owner picks per salon which other roles get a Call and a Text button (Settings → Call + text clients).
-- Every tap is logged (client.called / client.texted) so the owner can trace who reached out, and when.
alter table public.salons add column if not exists contact_settings jsonb not null
  default '{"call":["manager","front_desk"],"text":["manager","front_desk"]}'::jsonb;

-- Clean list of roles allowed for one way (owner is always allowed and never stored).
create or replace function public._contact_roles(s jsonb, way text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(select r from jsonb_array_elements_text(coalesce(s->way, '[]'::jsonb)) r
    where r in ('manager', 'front_desk', 'tech') order by r), '{}'::text[]);
$$;

create or replace function public.contact_settings_get(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s jsonb;
begin
  if not public.is_member(p_salon) then raise exception 'not allowed' using errcode = '42501'; end if;
  select contact_settings into s from public.salons where id = p_salon;
  return jsonb_build_object('call', to_jsonb(public._contact_roles(s, 'call')), 'text', to_jsonb(public._contact_roles(s, 'text')));
end $$;

create or replace function public.contact_settings_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c text[] := public._contact_roles(p, 'call'); x text[] := public._contact_roles(p, 'text');
begin
  if not public.is_owner(p_salon) then raise exception 'Only the owner can change who may call or text clients' using errcode = '42501'; end if;
  update public.salons set contact_settings = jsonb_build_object('call', to_jsonb(c), 'text', to_jsonb(x)) where id = p_salon;
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (p_salon, public.my_person_id(), 'contact.saved', jsonb_build_object('call', array_to_string(c, ', '), 'text', array_to_string(x, ', ')));
  return public.contact_settings_get(p_salon);
end $$;

-- Log one Call / Text tap. p_by = the person acting on a shared salon device (PIN), else the signed-in member.
-- Refused when that person's role isn't allowed for this way by the owner's setting.
create or replace function public.client_contact_log(p_salon uuid, p_client uuid, p_appt uuid, p_way text, p_by uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare role text; mid uuid; s jsonb;
begin
  if p_way not in ('call', 'text') then raise exception 'bad way' using errcode = '22023'; end if;
  if not public.is_member(p_salon) then raise exception 'not allowed' using errcode = '42501'; end if;
  select m.id, m.role into mid, role from public.memberships m
    where m.salon_id = p_salon and m.archived_at is null
      and (m.id = p_by or (p_by is null and m.person_id = public.my_person_id()))
    limit 1;
  if mid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select contact_settings into s from public.salons where id = p_salon;
  if role <> 'owner' and not (role = any (public._contact_roles(s, p_way))) then
    raise exception 'The owner has turned this off for your role' using errcode = '42501';
  end if;
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (p_salon, public.my_person_id(), case p_way when 'call' then 'client.called' else 'client.texted' end,
          jsonb_build_object('client', p_client, 'appointment', p_appt, 'membership', mid, 'role', role));
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public._contact_roles(jsonb, text) from public, anon, authenticated;
revoke execute on function public.contact_settings_get(uuid), public.contact_settings_save(uuid, jsonb),
  public.client_contact_log(uuid, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.contact_settings_get(uuid), public.contact_settings_save(uuid, jsonb),
  public.client_contact_log(uuid, uuid, uuid, text, uuid) to authenticated;
