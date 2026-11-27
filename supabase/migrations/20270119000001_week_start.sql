-- Week starts on (Nov 26, Oliver): each salon picks Monday (default) or Sunday.
-- Used on the device for every "this week" (payout sheet, earnings, time clock, timesheet, tech schedule),
-- the calendar's week + month views and every date picker. No server math uses it (no weekly sums in SQL).
--  * salons.week_start: 1 = Monday, 0 = Sunday.
--  * week_start_get: any member reads (devices cache it for offline).
--  * week_start_save: owner/manager; logged 'salon.week_start' with old + new day.
alter table public.salons add column if not exists week_start smallint not null default 1
  constraint salons_week_start_check check (week_start in (0, 1));

create or replace function public.week_start_get(p_salon uuid) returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_salon) then raise exception 'not allowed'; end if;
  return (select s.week_start from public.salons s where s.id = p_salon);
end $$;

create or replace function public.week_start_save(p_salon uuid, p_day int) returns int
language plpgsql security definer set search_path = '' as $$
declare old int;
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if p_day is null or p_day not in (0, 1) then raise exception 'week starts Monday (1) or Sunday (0)'; end if;
  select s.week_start into old from public.salons s where s.id = p_salon for update;
  if old is distinct from p_day then
    update public.salons set week_start = p_day where id = p_salon;
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, public.my_person_id(), 'salon.week_start', jsonb_build_object('from', old, 'to', p_day));
  end if;
  return p_day;
end $$;

revoke execute on function public.week_start_get(uuid), public.week_start_save(uuid, int) from public, anon;
grant execute on function public.week_start_get(uuid), public.week_start_save(uuid, int) to authenticated;
