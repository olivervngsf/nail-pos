-- Backup page polishosapp.com/device (Nov 25): this tablet's facts + a safe way off it, never covered by the faces screen.
-- Reserve the word so no salon can take it as its booking-page name. Adds to whatever the list is now.
do $mig$
declare cur text[] := public._slug_reserved(); add text[] := array['device']; w text;
begin
  foreach w in array add loop if not w = any(cur) then cur := cur || w; end if; end loop;
  execute format($f$create or replace function public._slug_reserved() returns text[] language sql immutable set search_path = '' as $b$ select %L::text[]; $b$$f$, cur);
end $mig$;
