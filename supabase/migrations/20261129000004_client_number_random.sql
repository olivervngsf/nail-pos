-- Client number = random 5 digits (Oliver, Nov 17): "#48213" instead of 1, 2, 3… Unique per salon, never reused,
-- not guessable from how many clients a salon has, and 5 digits so it's never mixed up with the phone's last 4 (••0142).
-- Room for 90,000 clients per salon. Replaces the counter from 20261129000003_client_number (table kept, unused).

create or replace function public._client_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int; tries int := 0;
begin
  loop
    n := 10000 + floor(random() * 90000)::int;
    exit when not exists (select 1 from public.clients where salon_id = new.salon_id and number = n);
    tries := tries + 1;
    if tries > 50 then raise exception 'no free client number'; end if;
  end loop;
  new.number := n;
  return new;
end $$;
revoke execute on function public._client_number() from public, anon, authenticated;

-- Clients that already had 1, 2, 3… get a random 5-digit number too.
do $$
declare r record; n int;
begin
  for r in select id, salon_id from public.clients where number < 10000 order by created_at loop
    loop
      n := 10000 + floor(random() * 90000)::int;
      exit when not exists (select 1 from public.clients where salon_id = r.salon_id and number = n);
    end loop;
    update public.clients set number = n where id = r.id;
  end loop;
end $$;
alter table public.clients add constraint clients_number_5 check (number between 10000 and 99999);
comment on table public.client_counters is 'Unused since 20261129000004 (client numbers are random 5 digits).';
