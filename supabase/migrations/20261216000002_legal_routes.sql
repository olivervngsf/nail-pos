-- Legal pages (/legal/terms, /legal/privacy, /legal/texts + short /terms, /privacy): keep those words from being used as a salon's booking link.
-- Adds to whatever the list is now (other changes add words too), instead of writing the whole list again.
do $mig$
declare cur text[] := public._slug_reserved(); add text[] := array['legal', 'terms', 'privacy']; w text;
begin
  foreach w in array add loop if not w = any(cur) then cur := cur || w; end if; end loop;
  execute format($f$create or replace function public._slug_reserved() returns text[] language sql immutable set search_path = '' as $b$ select %L::text[]; $b$$f$, cur);
end $mig$;
