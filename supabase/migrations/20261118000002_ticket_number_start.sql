-- First ticket of a salon is #1001 (the counter row is created with this value; later tickets add 1).
alter table public.ticket_counters alter column last set default 1001;
