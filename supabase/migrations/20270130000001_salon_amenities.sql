-- Amenities (Nov 27): owner ticks what the salon offers for free (wine, tea + coffee, Wi-Fi, …) in Settings → Booking page.
-- Stored in salons.booking_settings.amenities as a list of known keys (src/lib/booking/amenities.ts AMENITIES);
-- unknown keys are dropped, order follows the list. Shown on the booking page (book_page already returns booking_settings)
-- and the client's digital receipt. Same rules as before for everything else; only adds 'amenities'.
create or replace function public.booking_settings_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cur jsonb; sl text := nullif(lower(trim(p->>'slug')), '');
  known text[] := array['wine', 'coffee', 'water', 'wifi', 'massage_chairs', 'kids', 'parking', 'wheelchair', 'walk_ins', 'vietnamese', 'spanish'];
  am jsonb;
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if sl is not null and sl !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then return jsonb_build_object('ok', false, 'reason', 'slug_bad'); end if;
  if sl is not null and exists (select 1 from public.salons where slug = sl and id <> p_salon) then return jsonb_build_object('ok', false, 'reason', 'slug_taken'); end if;
  if sl = any (public._slug_reserved()) then
    return jsonb_build_object('ok', false, 'reason', 'slug_taken');
  end if;
  if p ? 'amenities' and jsonb_typeof(p->'amenities') = 'array' then
    select coalesce(jsonb_agg(k order by array_position(known, k)), '[]'::jsonb) into am
      from (select distinct x as k from jsonb_array_elements_text(p->'amenities') x where x = any (known)) s;
  end if;
  select booking_settings into cur from public.salons where id = p_salon;
  update public.salons set slug = coalesce(sl, slug), booking_settings = cur || jsonb_strip_nulls(jsonb_build_object(
    'slug_set', case when sl is not null then true end,
    'on', (p->>'on')::boolean,
    'days_ahead', case when p ? 'days_ahead' and p->>'days_ahead' is not null then least(90, greatest(1, (p->>'days_ahead')::int)) end,
    'latest_before_close', case when p ? 'latest_before_close' and p->>'latest_before_close' is not null then least(240, greatest(0, (p->>'latest_before_close')::int)) end,
    'group_max', case when p ? 'group_max' and p->>'group_max' is not null then least(6, greatest(1, (p->>'group_max')::int)) end,
    'cancel_hours', case when p ? 'cancel_hours' and p->>'cancel_hours' is not null then least(48, greatest(0, (p->>'cancel_hours')::int)) end,
    'calendar_note', left(trim(p->>'calendar_note'), 500),
    'calendar_alarm_min', case when (p->>'calendar_alarm_min') in ('0', '30', '60', '120', '1440') then (p->>'calendar_alarm_min')::int end,
    'amenities', am)) where id = p_salon;
  if am is not null then
    insert into public.audit_log (salon_id, action, detail) values (p_salon, 'amenities.saved', jsonb_build_object('amenities', am));
  end if;
  return jsonb_build_object('ok', true, 'slug', (select slug from public.salons where id = p_salon));
end $$;
