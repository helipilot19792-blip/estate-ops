begin;

-- Document-vault object keys already begin with the organization UUID. Restrict
-- non-platform administrators to that first folder segment without changing any
-- bucket, table, column, or stored object.
drop policy if exists "Admins can upload document vault objects" on storage.objects;
create policy "Admins can upload document vault objects"
on storage.objects
for insert
with check (
  bucket_id = 'document-vault'
  and (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'platform_admin'
    )
    or exists (
      select 1
      from public.organization_members
      where organization_members.profile_id = auth.uid()
        and organization_members.role = 'admin'
        and organization_members.organization_id::text = (storage.foldername(name))[1]
    )
  )
);

drop policy if exists "Admins can read document vault objects" on storage.objects;
create policy "Admins can read document vault objects"
on storage.objects
for select
using (
  bucket_id = 'document-vault'
  and (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'platform_admin'
    )
    or exists (
      select 1
      from public.organization_members
      where organization_members.profile_id = auth.uid()
        and organization_members.role = 'admin'
        and organization_members.organization_id::text = (storage.foldername(name))[1]
    )
  )
);

drop policy if exists "Admins can delete document vault objects" on storage.objects;
create policy "Admins can delete document vault objects"
on storage.objects
for delete
using (
  bucket_id = 'document-vault'
  and (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'platform_admin'
    )
    or exists (
      select 1
      from public.organization_members
      where organization_members.profile_id = auth.uid()
        and organization_members.role = 'admin'
        and organization_members.organization_id::text = (storage.foldername(name))[1]
    )
  )
);

commit;
