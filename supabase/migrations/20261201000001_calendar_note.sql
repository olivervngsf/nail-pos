-- Owner's calendar note (parking, arrive early, …) shown in the client's "Add to calendar" event.
-- Stored in salons.booking_settings.calendar_note (max 500 chars, '' clears it). Same rules as before for the rest.
create or replace function public.booking_settings_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cur jsonb; sl text := nullif(lower(trim(p->>'slug')), '');
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if sl is not null and sl !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then return jsonb_build_object('ok', false, 'reason', 'slug_bad'); end if;
  if sl is not null and exists (select 1 from public.salons where slug = sl and id <> p_salon) then return jsonb_build_object('ok', false, 'reason', 'slug_taken'); end if;
  if sl = any (public._slug_reserved()) then
    return jsonb_build_object('ok', false, 'reason', 'slug_taken');
  end if;
  select booking_settings into cur from public.salons where id = p_salon;
  update public.salons set slug = coalesce(sl, slug), booking_settings = cur || jsonb_strip_nulls(jsonb_build_object(
    'slug_set', case when sl is not null then true end,
    'on', (p->>'on')::boolean,
    'days_ahead', least(90, greatest(1, (p->>'days_ahead')::int)),
    'latest_before_close', least(240, greatest(0, (p->>'latest_before_close')::int)),
    'group_max', least(6, greatest(1, (p->>'group_max')::int)),
    'cancel_hours', least(48, greatest(0, (p->>'cancel_hours')::int)),
    'calendar_note', left(trim(p->>'calendar_note'), 500))) where id = p_salon;
  return jsonb_build_object('ok', true, 'slug', (select slug from public.salons where id = p_salon));
end $$;
