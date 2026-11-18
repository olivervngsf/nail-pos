-- Booking page settings: a save only changes what was sent.
-- Before: greatest(1, null) = 1 in Postgres (nulls are ignored), so a save with only { slug } or { on }
-- wrote days_ahead 1, group_max 1, cancel_hours 0, latest_before_close 0.
-- Now each number is written only when its key is in p. Same body as the newest version on the test project
-- (incl. calendar_note / calendar_alarm_min from the Add-to-calendar work); grants unchanged.
-- p: { slug?, on?, days_ahead?, latest_before_close?, group_max?, cancel_hours?, calendar_note?, calendar_alarm_min? }
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
    'days_ahead', case when p ? 'days_ahead' and p->>'days_ahead' is not null then least(90, greatest(1, (p->>'days_ahead')::int)) end,
    'latest_before_close', case when p ? 'latest_before_close' and p->>'latest_before_close' is not null then least(240, greatest(0, (p->>'latest_before_close')::int)) end,
    'group_max', case when p ? 'group_max' and p->>'group_max' is not null then least(6, greatest(1, (p->>'group_max')::int)) end,
    'cancel_hours', case when p ? 'cancel_hours' and p->>'cancel_hours' is not null then least(48, greatest(0, (p->>'cancel_hours')::int)) end,
    'calendar_note', left(trim(p->>'calendar_note'), 500),
    'calendar_alarm_min', case when (p->>'calendar_alarm_min') in ('0', '30', '60', '120', '1440') then (p->>'calendar_alarm_min')::int end)) where id = p_salon;
  return jsonb_build_object('ok', true, 'slug', (select slug from public.salons where id = p_salon));
end $$;
