-- Closed days stay closed. A payment, refund or paid ticket that arrives late (e.g. saved offline yesterday, synced today)
-- with a time on a day that was already closed is moved to now (or, if today is closed too, to the start of the next open day),
-- so a closed day's numbers never change after the count. Logged as 'money.after_close' so the owner can see it happened.

create function public._open_time(p_salon uuid, p_at timestamptz) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare tz text; d date; ts timestamptz := p_at;
begin
  select time_zone into tz from public.salons where id = p_salon;
  if tz is null or ts is null then return ts; end if;
  for i in 1..60 loop
    d := (ts at time zone tz)::date;
    exit when not exists (select 1 from public.day_closes c where c.salon_id = p_salon and c.day = d);
    ts := greatest(now(), ((d + 1)::timestamp at time zone tz));
  end loop;
  return ts;
end $$;

-- Tickets: paid_at. Payments + refunds: at. (Separate statements: plpgsql can't name a column the row doesn't have.)
create function public._closed_day_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare was timestamptz; moved timestamptz;
begin
  if tg_table_name = 'tickets' then
    was := new.paid_at;
    if was is null or (tg_op = 'UPDATE' and old.paid_at is not distinct from was) then return new; end if;
    moved := public._open_time(new.salon_id, was);
    new.paid_at := moved;
  else
    was := new.at;
    if was is null or (tg_op = 'UPDATE' and old.at is not distinct from was) then return new; end if;
    moved := public._open_time(new.salon_id, was);
    new.at := moved;
  end if;
  if moved is distinct from was then
    insert into public.audit_log (salon_id, action, detail)
      values (new.salon_id, 'money.after_close', jsonb_build_object('table', tg_table_name, 'id', new.id, 'was', was, 'now', moved));
  end if;
  return new;
end $$;

create trigger closed_day_guard before insert or update of at on public.payments
  for each row execute function public._closed_day_guard();
create trigger closed_day_guard before insert on public.refunds
  for each row execute function public._closed_day_guard();
create trigger closed_day_guard before insert or update of paid_at on public.tickets
  for each row execute function public._closed_day_guard();

revoke execute on function public._open_time(uuid, timestamptz), public._closed_day_guard() from public, anon, authenticated;
