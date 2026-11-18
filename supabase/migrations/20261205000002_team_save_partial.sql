-- team_save: an edit only changes the fields it sends (a manager's quick edit doesn't wipe skills, days, license, language).
create or replace function public.team_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (p->>'salonId')::uuid; mid uuid := nullif(p->>'id', '')::uuid; cur public.memberships;
  own boolean; r public.member_role; ph text := p->>'phone'; code text;
  sk text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'skills', '[]'::jsonb))), '{}');
  wd smallint[] := coalesce(array(select x::smallint from jsonb_array_elements_text(coalesce(p->'workdays', '[]'::jsonb)) x where x ~ '^[0-6]$'), '{}');
begin
  if sid is null or not public.is_admin(sid) then raise exception 'not allowed'; end if;
  own := public._is_owner(sid);
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'name needed'; end if;
  if coalesce(ph, '') !~ '^\+1[0-9]{10}$' then raise exception 'phone needed'; end if;
  if mid is not null then
    select * into cur from public.memberships where id = mid and salon_id = sid and archived_at is null for update;
    if cur.id is null then raise exception 'not found'; end if;
    if cur.role = 'owner' and not own then raise exception 'not allowed'; end if;
  end if;
  r := case when cur.role = 'owner' then 'owner'::public.member_role else coalesce((p->>'role')::public.member_role, cur.role) end;
  if r = 'owner' and cur.id is null then raise exception 'not allowed'; end if;
  if r = 'owner' and cur.role is distinct from 'owner' then raise exception 'not allowed'; end if;
  if cur.id is null then
    insert into public.memberships (salon_id, display_name, phone, role, language, nickname, email, birthday, emergency, skills, workdays,
      license_no, license_state, license_expires, start_date, pay_type, commission_pct, hourly_cents, check_pct)
    values (sid, trim(p->>'name'), ph, r, case when p->>'language' = 'vi' then 'vi' else 'en' end,
      nullif(trim(p->>'nickname'), ''), nullif(lower(trim(p->>'email')), ''), nullif(p->>'birthday', ''), nullif(trim(p->>'emergency'), ''), sk, wd,
      nullif(trim(p->>'licenseNo'), ''), nullif(p->>'licenseState', ''), nullif(p->>'licenseExpires', '')::date, nullif(p->>'startDate', '')::date,
      case when own then nullif(p->>'payType', '')::public.pay_type end,
      case when own then nullif(p->>'commissionPct', '')::numeric end,
      case when own then nullif(p->>'hourlyCents', '')::int end,
      case when own then least(greatest(coalesce(nullif(p->>'checkPct', '')::int, 100), 0), 100) else 100 end)
    returning id into mid;
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    insert into public.invites (code, salon_id, membership_id) values (code, sid, mid);
    insert into public.audit_log (salon_id, person_id, action, detail) values (sid, public.my_person_id(), 'staff.added', jsonb_build_object('membership', mid));
  else
    update public.memberships set
      display_name = trim(p->>'name'),
      phone = case when cur.person_id is null then ph else cur.phone end,
      role = r,
      language = case when not p ? 'language' then cur.language when p->>'language' = 'vi' then 'vi' else 'en' end,
      nickname = case when p ? 'nickname' then nullif(trim(p->>'nickname'), '') else cur.nickname end,
      email = case when p ? 'email' then nullif(lower(trim(p->>'email')), '') else cur.email end,
      birthday = case when p ? 'birthday' then nullif(p->>'birthday', '') else cur.birthday end,
      emergency = case when p ? 'emergency' then nullif(trim(p->>'emergency'), '') else cur.emergency end,
      skills = case when p ? 'skills' then sk else cur.skills end,
      workdays = case when p ? 'workdays' then wd else cur.workdays end,
      license_no = case when p ? 'licenseNo' then nullif(trim(p->>'licenseNo'), '') else cur.license_no end,
      license_state = case when p ? 'licenseState' then nullif(p->>'licenseState', '') else cur.license_state end,
      license_expires = case when p ? 'licenseExpires' then nullif(p->>'licenseExpires', '')::date else cur.license_expires end,
      start_date = case when p ? 'startDate' then nullif(p->>'startDate', '')::date else cur.start_date end,
      pay_type = case when own and p ? 'payType' then nullif(p->>'payType', '')::public.pay_type else cur.pay_type end,
      commission_pct = case when own and p ? 'commissionPct' then nullif(p->>'commissionPct', '')::numeric else cur.commission_pct end,
      hourly_cents = case when own and p ? 'hourlyCents' then nullif(p->>'hourlyCents', '')::int else cur.hourly_cents end,
      check_pct = case when own and p ? 'checkPct' then least(greatest(coalesce(nullif(p->>'checkPct', '')::int, cur.check_pct), 0), 100) else cur.check_pct end
    where id = mid;
    insert into public.audit_log (salon_id, person_id, action, detail) values (sid, public.my_person_id(), 'staff.edited', jsonb_build_object('membership', mid));
  end if;
  return jsonb_build_object('id', mid, 'invite', code);
end $$;
