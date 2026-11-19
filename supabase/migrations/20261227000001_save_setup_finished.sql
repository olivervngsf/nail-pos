-- "1 not saved · tap to retry": an old setup save left on a device kept being refused
-- (duplicate key memberships_salon_id_phone_key) once the same phone was already on the team.
-- Worse, had it gone through it would have archived staff and services added later in Settings.
-- Now:
--  1. A salon whose setup was already finished (setup_step >= 9 before this call): the wizard no longer
--     changes services or staff. Settings → Team and the menu own them. Salon info + hours still save.
--  2. During setup: a staff row whose phone is already on another member of this salon is left alone
--     (that member is kept), instead of failing the whole save.
create or replace function public.save_setup(p jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  sid uuid := (p->>'salonId')::uuid;
  pid uuid := public._ensure_person(p->>'ownerName');
  ph text := public._auth_phone();
  h jsonb; sv jsonb; st jsonb; i int := 0;
  keep_services uuid[] := '{}'; keep_staff uuid[] := '{}';
  done boolean := false; other uuid;
begin
  if sid is null then raise exception 'salonId required'; end if;
  if not exists (select 1 from public.salons where id = sid) then
    insert into public.salons (id, name, state) values (sid, coalesce(nullif(p->>'salonName', ''), 'My salon'), coalesce(p->>'state', 'CA'));
    insert into public.memberships (salon_id, person_id, user_id, display_name, phone, role)
      values (sid, pid, (select auth.uid()), coalesce(nullif(p->>'ownerName', ''), 'Owner'), ph, 'owner');
    insert into public.audit_log (salon_id, person_id, action) values (sid, pid, 'salon.created');
  elsif not public.is_admin(sid) then
    raise exception 'not allowed';
  end if;

  select setup_step >= 9 into done from public.salons where id = sid;

  update public.salons set
    name = coalesce(nullif(p->>'salonName', ''), name),
    phone = nullif(p->>'salonPhone', ''),
    address = nullif(p->>'address', ''),
    state = coalesce(p->>'state', state),
    setup_step = greatest(setup_step, coalesce((p->>'step')::smallint, 0))
  where id = sid;

  for h in select * from jsonb_array_elements(coalesce(p->'hours', '[]')) loop
    insert into public.salon_hours (salon_id, weekday, is_open, opens, closes)
    values (sid, i, (h->>'on')::boolean, case when (h->>'on')::boolean then (h->>'open')::time end, case when (h->>'on')::boolean then (h->>'close')::time end)
    on conflict (salon_id, weekday) do update set is_open = excluded.is_open, opens = excluded.opens, closes = excluded.closes;
    i := i + 1;
  end loop;

  if done then return sid; end if;

  if p ? 'services' then
    i := 0;
    for sv in select * from jsonb_array_elements(p->'services') loop
      i := i + 1;
      continue when coalesce(sv->>'name', '') = '' or coalesce((sv->>'minutes')::int, 0) <= 0;
      insert into public.services (id, salon_id, category, name, minutes, price_cents, price_from, sort, archived_at)
      values ((sv->>'id')::uuid, sid, coalesce(sv->>'cat', ''), sv->>'name', (sv->>'minutes')::int, greatest(0, (sv->>'priceCents')::int), coalesce((sv->>'priceFrom')::boolean, false), i,
              case when (sv->>'on')::boolean then null else now() end)
      on conflict (id) do update set category = excluded.category, name = excluded.name, minutes = excluded.minutes,
        price_cents = excluded.price_cents, price_from = excluded.price_from, sort = excluded.sort, archived_at = excluded.archived_at
      where public.services.salon_id = sid;
      keep_services := keep_services || (sv->>'id')::uuid;
    end loop;
    update public.services set archived_at = now() where salon_id = sid and archived_at is null and not (id = any (keep_services));
  end if;

  if p ? 'staff' then
    for st in select * from jsonb_array_elements(p->'staff') loop
      continue when st->>'role' = 'owner' or coalesce(st->>'phone', '') = '';
      -- Same phone already on someone else in this salon: keep that member as is.
      select id into other from public.memberships where salon_id = sid and phone = st->>'phone' and id <> (st->>'id')::uuid;
      if other is not null then
        keep_staff := keep_staff || other;
        continue;
      end if;
      insert into public.memberships (id, salon_id, display_name, phone, role, pay_type, commission_pct, hourly_cents)
      values ((st->>'id')::uuid, sid, st->>'name', st->>'phone', (st->>'role')::public.member_role,
              nullif(st->>'payType', '')::public.pay_type, (st->>'commissionPct')::numeric, (st->>'hourlyCents')::int)
      on conflict (id) do update set display_name = excluded.display_name, phone = excluded.phone, role = excluded.role,
        pay_type = excluded.pay_type, commission_pct = excluded.commission_pct, hourly_cents = excluded.hourly_cents
      where public.memberships.salon_id = sid and public.memberships.role <> 'owner';
      if coalesce(st->>'inviteCode', '') <> '' then
        insert into public.invites (code, salon_id, membership_id) values (st->>'inviteCode', sid, (st->>'id')::uuid) on conflict (code) do nothing;
      end if;
      keep_staff := keep_staff || (st->>'id')::uuid;
    end loop;
    update public.memberships set archived_at = now()
    where salon_id = sid and archived_at is null and role <> 'owner' and not (id = any (keep_staff)) and person_id is null;
  end if;
  return sid;
end $function$;
