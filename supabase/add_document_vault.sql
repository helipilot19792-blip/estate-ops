insert into storage.buckets (id, name, public)
values ('document-vault', 'document-vault', false)
on conflict (id) do update set public = false;

create table if not exists public.document_vault_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  title text not null,
  category text not null default 'General',
  file_name text not null,
  file_size bigint,
  mime_type text,
  storage_path text not null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_vault_files_storage_path_unique unique (storage_path)
);

create index if not exists document_vault_files_org_created_idx
  on public.document_vault_files (organization_id, created_at desc);

create index if not exists document_vault_files_property_idx
  on public.document_vault_files (property_id, created_at desc);

create index if not exists document_vault_files_category_idx
  on public.document_vault_files (organization_id, category);

alter table public.document_vault_files enable row level security;

drop policy if exists "Admins can read document vault files" on public.document_vault_files;
create policy "Admins can read document vault files"
on public.document_vault_files
for select
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = document_vault_files.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can insert document vault files" on public.document_vault_files;
create policy "Admins can insert document vault files"
on public.document_vault_files
for insert
with check (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = document_vault_files.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can delete document vault files" on public.document_vault_files;
create policy "Admins can delete document vault files"
on public.document_vault_files
for delete
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = document_vault_files.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can upload document vault objects" on storage.objects;
create policy "Admins can upload document vault objects"
on storage.objects
for insert
with check (
  bucket_id = 'document-vault'
  and exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can read document vault objects" on storage.objects;
create policy "Admins can read document vault objects"
on storage.objects
for select
using (
  bucket_id = 'document-vault'
  and exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can delete document vault objects" on storage.objects;
create policy "Admins can delete document vault objects"
on storage.objects
for delete
using (
  bucket_id = 'document-vault'
  and exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);
