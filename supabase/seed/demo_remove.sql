-- Remove the Lotus demo salon (7e570000-…0001) and everything it owns. Run on LIVE before the first real salon goes in.
-- Deletes rows from every public table with a salon_id for this salon, looping until foreign keys stop blocking,
-- then the salon itself. Touches no other salon. Demo people (+1555010000x) are removed if they belong to no other salon.
do $$
declare
  sid uuid := '7e570000-0000-4000-8000-000000000001';
  t record; left_rows int; pass int := 0; n int;
begin
  set local session_replication_role = replica;  -- skip triggers (loyalty, keep_phone_lines, "nothing deleted" guards) for this one-off cleanup
  loop
    pass := pass + 1; left_rows := 0;
    for t in select c.table_name from information_schema.columns c
             join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
             where c.table_schema = 'public' and c.column_name = 'salon_id' loop
      begin
        execute format('delete from public.%I where salon_id = $1', t.table_name) using sid;
      exception when foreign_key_violation then
        execute format('select count(*) from public.%I where salon_id = $1', t.table_name) using sid into n;
        left_rows := left_rows + n;
      end;
    end loop;
    exit when left_rows = 0 or pass > 10;
  end loop;
  if left_rows > 0 then raise exception 'Demo not fully removed: % rows still blocked', left_rows; end if;
  delete from public.salons where id = sid;
  delete from public.people p where p.phone like '+1555010000_'
    and not exists (select 1 from public.memberships m where m.person_id = p.id);
end $$;

select count(*) as demo_salons_left from public.salons where id = '7e570000-0000-4000-8000-000000000001';
