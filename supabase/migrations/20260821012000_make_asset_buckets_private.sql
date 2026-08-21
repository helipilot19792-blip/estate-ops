begin;

-- Application code accepts both legacy public URLs and storage:// references before
-- this migration is applied, so existing rows and objects do not need to move.
update storage.buckets
set public = false
where id in ('invoice-assets', 'property-sop-images');

drop policy if exists "Admins can upload invoice assets" on storage.objects;
drop policy if exists "Admins can update invoice assets" on storage.objects;
drop policy if exists "Admins can read invoice assets" on storage.objects;
drop policy if exists "Organization admins manage private invoice assets" on storage.objects;
drop policy if exists "Owners can read private invoice assets" on storage.objects;

create policy "Organization admins manage private invoice assets"
on storage.objects
for all
using (
  bucket_id = 'invoice-assets'
  and exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id::text = (storage.foldername(name))[1]
    where profiles.id = auth.uid()
      and (profiles.role = 'platform_admin' or organization_members.role = 'admin')
  )
)
with check (
  bucket_id = 'invoice-assets'
  and exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id::text = (storage.foldername(name))[1]
    where profiles.id = auth.uid()
      and (profiles.role = 'platform_admin' or organization_members.role = 'admin')
  )
);

create policy "Owners can read private invoice assets"
on storage.objects
for select
using (
  bucket_id = 'invoice-assets'
  and exists (
    select 1
    from public.owner_accounts
    where owner_accounts.profile_id = auth.uid()
      and owner_accounts.organization_id::text = (storage.foldername(name))[1]
      and owner_accounts.is_active = true
  )
);

drop policy if exists "Admins can upload property knowledge objects" on storage.objects;
drop policy if exists "Admins can update property knowledge objects" on storage.objects;
drop policy if exists "Admins can delete property knowledge objects" on storage.objects;
drop policy if exists "Organization admins manage private property assets" on storage.objects;
drop policy if exists "Owners can read private property covers" on storage.objects;

create policy "Organization admins manage private property assets"
on storage.objects
for all
using (
  bucket_id = 'property-sop-images'
  and exists (
    select 1
    from public.properties
    join public.profiles on profiles.id = auth.uid()
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = properties.organization_id
    where properties.id::text = (storage.foldername(name))[1]
      and (profiles.role = 'platform_admin' or organization_members.role = 'admin')
  )
)
with check (
  bucket_id = 'property-sop-images'
  and exists (
    select 1
    from public.properties
    join public.profiles on profiles.id = auth.uid()
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = properties.organization_id
    where properties.id::text = (storage.foldername(name))[1]
      and (profiles.role = 'platform_admin' or organization_members.role = 'admin')
  )
);

create policy "Owners can read private property covers"
on storage.objects
for select
using (
  bucket_id = 'property-sop-images'
  and (storage.foldername(name))[2] = 'cover'
  and exists (
    select 1
    from public.owner_accounts
    join public.owner_property_access
      on owner_property_access.owner_account_id = owner_accounts.id
    where owner_accounts.profile_id = auth.uid()
      and owner_accounts.is_active = true
      and owner_property_access.property_id::text = (storage.foldername(name))[1]
  )
);

commit;
