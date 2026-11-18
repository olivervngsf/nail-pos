-- Ticket slip sync fixes (Codex review of the slip flow):
-- 1. A service a tech removed from their phone stays removed: a desk that still had it can't bring it back with its next save
--    (save_ticket's upsert sets removed_at = null). tech_removed_at marks it; the guard keeps it removed.
-- 2. A "$45+" service a tech adds is price_open until the desk changes its price, so every desk asks for the final price first.
-- (Acknowledging phone lines on first load is a desk change: pullTickets now acks every unconfirmed phone line it holds.)
alter table public.ticket_lines
  add column if not exists tech_removed_at timestamptz,
  add column if not exists price_open boolean not null default false;

-- Phone "$45+" lines still waiting for their final price on open tickets.
update public.ticket_lines l set price_open = true
from public.tickets t
where t.id = l.ticket_id and t.status = 'open' and l.source = 'phone' and l.price_from and l.removed_at is null and l.desk_seen_at is null;

create or replace function public._ticket_line_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.source = 'phone' and new.price_from then new.price_open := true; end if;
    return new;
  end if;
  -- A tech removed this line: nothing brings it back (a tech re-adds a service as a new line).
  if old.tech_removed_at is not null then
    new.removed_at := old.removed_at;
    new.tech_removed_at := old.tech_removed_at;
  elsif new.removed_at is not null and old.removed_at is null and coalesce(current_setting('app.tech_remove', true), '') = 'on' then
    new.tech_removed_at := now();
  end if;
  -- The desk set the final price.
  if old.price_open and new.amount_cents is distinct from old.amount_cents then new.price_open := false; end if;
  return new;
end $$;

-- Runs after keep_phone_lines (triggers fire in name order).
drop trigger if exists ticket_line_guard on public.ticket_lines;
create trigger ticket_line_guard before insert or update on public.ticket_lines for each row execute function public._ticket_line_guard();
revoke execute on function public._ticket_line_guard() from public, anon, authenticated;
