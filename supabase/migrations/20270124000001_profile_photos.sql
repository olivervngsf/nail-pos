-- Profile photos (Nov 26): each login may upload one photo of themselves (Settings → Profile → Edit photo).
-- Files live in Storage bucket "profile-photos" under <auth user id>/<random>.jpg; the link is kept on the login
-- (auth user_metadata.photo_url), so no table changes. Anyone may read a photo by its link (the bucket is public so
-- avatars load without a signed link); only the owner of the folder may add, replace or delete files in it.
-- Skipped where Storage isn't installed (e.g. CI's plain Postgres).
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('profile-photos', 'profile-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    execute $p$create policy "own profile photo upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own profile photo select" on storage.objects for select to authenticated
      using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own profile photo update" on storage.objects for update to authenticated
      using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own profile photo delete" on storage.objects for delete to authenticated
      using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  end if;
end $$;
