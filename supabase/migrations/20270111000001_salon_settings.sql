-- Settings → Salon (Nov 25): everything from setup can be changed later in one place.
--  * salon_info_get: name, phone, address, state, time zone, opening hours, the whole menu (members read).
--  * salon_info_save: owner/manager; name, phone, address, state, time zone + 7 days of hours. Logged 'salon.info_saved'.
--    Moving to CA/MN turns the card fee on tips off (locked by law there; the table check would refuse it).
--  * menu_service_save: owner/manager; add or change one service (group, name, minutes, price, "from" price, online).
--    Logged 'service.saved'. menu_service_remove: hides it from the menu (archived, never deleted), logged 'service.removed'.

create or replace function public.salon_info_get(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_salon) then raise exception 'not allowed'; end if;
  return (
    select jsonb_build_object(
      'name', s.name, 'phone', s.phone, 'address', s.address, 'state', s.state, 'time_zone', s.time_zone,
      'can_edit', public.is_admin(p_salon),
      'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'on', h.is_open,
                  'open', to_char(h.opens, 'HH24:MI'), 'close', to_char(h.closes, 'HH24:MI')) order by h.weekday)
                from public.salon_hours h where h.salon_id = p_salon), '[]'::jsonb),
      'services', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'cat', v.category, 'name', v.name, 'minutes', v.minutes,
                  'cents', v.price_cents, 'from', v.price_from, 'online', v.online) order by v.sort, v.name)
                from public.services v where v.salon_id = p_salon and v.archived_at is null), '[]'::jsonb))
    from public.salons s where s.id = p_salon);
end $$;
revoke execute on function public.salon_info_get(uuid) from public, anon;
grant execute on function public.salon_info_get(uuid) to authenticated;

create or replace function public.salon_info_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  nm text := trim(coalesce(p->>'name', ''));
  ph text := nullif(trim(coalesce(p->>'phone', '')), '');
  ad text := nullif(trim(coalesce(p->>'address', '')), '');
  st text := upper(trim(coalesce(p->>'state', '')));
  tz text := trim(coalesce(p->>'time_zone', ''));
  h jsonb; d int;
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if nm = '' or length(nm) > 80 then raise exception 'salon name needed (up to 80 letters)'; end if;
  if ph is not null and length(ph) > 30 then raise exception 'phone too long'; end if;
  if ad is not null and length(ad) > 200 then raise exception 'address too long'; end if;
  if st !~ '^[A-Z]{2}$' then raise exception 'state must be 2 letters'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then raise exception 'time zone not valid'; end if;
  if p ? 'hours' then
    if jsonb_array_length(p->'hours') <> 7 then raise exception 'hours need 7 days'; end if;
    for h in select * from jsonb_array_elements(p->'hours') loop
      d := (h->>'weekday')::int;
      if d is null or d < 0 or d > 6 then raise exception 'bad weekday'; end if;
      if (h->>'on')::boolean and (h->>'close')::time <= (h->>'open')::time then raise exception 'closing time must be after opening time'; end if;
    end loop;
  end if;

  update public.salons set name = nm, phone = ph, address = ad, state = st, time_zone = tz,
    tip_fee_passthrough = case when st in ('CA', 'MN') then false else tip_fee_passthrough end
  where id = p_salon;

  if p ? 'hours' then
    for h in select * from jsonb_array_elements(p->'hours') loop
      insert into public.salon_hours (salon_id, weekday, is_open, opens, closes)
      values (p_salon, (h->>'weekday')::smallint, (h->>'on')::boolean,
              case when (h->>'on')::boolean then (h->>'open')::time end, case when (h->>'on')::boolean then (h->>'close')::time end)
      on conflict (salon_id, weekday) do update set is_open = excluded.is_open, opens = excluded.opens, closes = excluded.closes;
    end loop;
  end if;

  insert into public.audit_log (salon_id, person_id, action, detail)
  values (p_salon, public.my_person_id(), 'salon.info_saved', jsonb_build_object('name', nm, 'state', st, 'time_zone', tz, 'hours', p ? 'hours'));
  return public.salon_info_get(p_salon);
end $$;
revoke execute on function public.salon_info_save(uuid, jsonb) from public, anon;
grant execute on function public.salon_info_save(uuid, jsonb) to authenticated;

create or replace function public.menu_service_save(p_salon uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := nullif(p->>'id', '')::uuid;
  nm text := trim(coalesce(p->>'name', ''));
  cat text := coalesce(nullif(trim(p->>'cat'), ''), 'Other');
  mins int := coalesce((p->>'minutes')::int, 0);
  cents int := coalesce((p->>'cents')::int, -1);
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if nm = '' or length(nm) > 80 then raise exception 'name needed'; end if;
  if length(cat) > 40 then raise exception 'group name too long'; end if;
  if mins < 5 or mins > 600 then raise exception 'minutes 5 to 600'; end if;
  if cents < 0 or cents > 10000000 then raise exception 'price not valid'; end if;
  if exists (select 1 from public.services where salon_id = p_salon and archived_at is null and lower(name) = lower(nm) and id is distinct from sid) then
    raise exception 'already on the menu';
  end if;
  if sid is null then
    insert into public.services (salon_id, category, name, minutes, price_cents, price_from, online, sort)
    values (p_salon, cat, nm, mins, cents, coalesce((p->>'from')::boolean, false), coalesce((p->>'online')::boolean, true),
            coalesce((select max(sort) from public.services where salon_id = p_salon), 0) + 1)
    returning id into sid;
  else
    update public.services set category = cat, name = nm, minutes = mins, price_cents = cents,
      price_from = coalesce((p->>'from')::boolean, price_from), online = coalesce((p->>'online')::boolean, online)
    where id = sid and salon_id = p_salon and archived_at is null;
    if not found then raise exception 'service not found'; end if;
  end if;
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (p_salon, public.my_person_id(), 'service.saved', jsonb_build_object('service', sid, 'name', nm, 'cat', cat, 'minutes', mins, 'cents', cents));
  return sid;
end $$;
revoke execute on function public.menu_service_save(uuid, jsonb) from public, anon;
grant execute on function public.menu_service_save(uuid, jsonb) to authenticated;

create or replace function public.menu_service_remove(p_salon uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  update public.services set archived_at = now() where id = p_id and salon_id = p_salon and archived_at is null returning name into nm;
  if nm is null then raise exception 'service not found'; end if;
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (p_salon, public.my_person_id(), 'service.removed', jsonb_build_object('service', p_id, 'name', nm));
end $$;
revoke execute on function public.menu_service_remove(uuid, uuid) from public, anon;
grant execute on function public.menu_service_remove(uuid, uuid) to authenticated;
