insert into storage.buckets (id, name, public)
values ('property-sop-images', 'property-sop-images', true)
on conflict (id) do nothing;

create table if not exists public.property_knowledge_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  image_url text not null,
  storage_path text,
  category text not null default 'other',
  caption text,
  processing_status text not null default 'unprocessed',
  keep_after_processing boolean not null default true,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists property_knowledge_images_property_idx
  on public.property_knowledge_images (property_id, created_at desc);

create index if not exists property_knowledge_images_org_idx
  on public.property_knowledge_images (organization_id, created_at desc);

alter table public.property_knowledge_images enable row level security;

drop policy if exists "Admins can read property knowledge images" on public.property_knowledge_images;
create policy "Admins can read property knowledge images"
on public.property_knowledge_images
for select
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = property_knowledge_images.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can manage property knowledge images" on public.property_knowledge_images;
create policy "Admins can manage property knowledge images"
on public.property_knowledge_images
for all
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = property_knowledge_images.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = property_knowledge_images.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can upload property knowledge objects" on storage.objects;
create policy "Admins can upload property knowledge objects"
on storage.objects
for insert
with check (
  bucket_id = 'property-sop-images'
  and (storage.foldername(name))[2] = 'knowledge'
  and exists (
    select 1
    from public.properties
    join public.profiles
      on profiles.id = auth.uid()
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = properties.organization_id
    where properties.id::text = (storage.foldername(name))[1]
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can update property knowledge objects" on storage.objects;
create policy "Admins can update property knowledge objects"
on storage.objects
for update
using (
  bucket_id = 'property-sop-images'
  and (storage.foldername(name))[2] = 'knowledge'
  and exists (
    select 1
    from public.properties
    join public.profiles
      on profiles.id = auth.uid()
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = properties.organization_id
    where properties.id::text = (storage.foldername(name))[1]
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
)
with check (
  bucket_id = 'property-sop-images'
  and (storage.foldername(name))[2] = 'knowledge'
  and exists (
    select 1
    from public.properties
    join public.profiles
      on profiles.id = auth.uid()
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = properties.organization_id
    where properties.id::text = (storage.foldername(name))[1]
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can delete property knowledge objects" on storage.objects;
create policy "Admins can delete property knowledge objects"
on storage.objects
for delete
using (
  bucket_id = 'property-sop-images'
  and (storage.foldername(name))[2] = 'knowledge'
  and exists (
    select 1
    from public.properties
    join public.profiles
      on profiles.id = auth.uid()
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = properties.organization_id
    where properties.id::text = (storage.foldername(name))[1]
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);
