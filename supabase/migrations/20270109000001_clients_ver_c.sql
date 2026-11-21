-- Clients version C (table + profile drawer) for user testing next to version D.
-- 1. client_list rows also carry 'spent' (cents, paid tickets) for the Spent column + sort.
-- 2. Reserve the test routes /clients-ver-c and /clients-ver-d so no salon can take them as a booking-page slug.

-- Rewritten from the current text so nothing else changes; fails loudly if the text moved.
do $mig$
declare d text; n text;
begin
  select pg_get_functiondef('public.client_list(uuid, text, text)'::regprocedure) into d;
  n := replace(d, $s$'gift_cents', gift_cents)$s$, $s$'gift_cents', gift_cents, 'spent', spent)$s$);
  if n = d then raise exception 'client_list: gift_cents line not found'; end if;
  execute n;
end $mig$;

-- Adds to whatever the list is now, instead of writing the whole list again.
do $mig$
declare cur text[] := public._slug_reserved(); add text[] := array['clients-ver-c', 'clients-ver-d']; w text;
begin
  foreach w in array add loop if not w = any(cur) then cur := cur || w; end if; end loop;
  execute format($f$create or replace function public._slug_reserved() returns text[] language sql immutable set search_path = '' as $b$ select %L::text[]; $b$$f$, cur);
end $mig$;
