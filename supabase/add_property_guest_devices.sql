alter table public.properties
  add column if not exists guest_device_welcome_message text,
  add column if not exists guest_device_local_info text;

create table if not exists public.property_guest_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  label text not null,
  token_hash text not null unique,
  token_last_four text not null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_guest_devices_property_idx
  on public.property_guest_devices(property_id, created_at desc);

create index if not exists property_guest_devices_org_idx
  on public.property_guest_devices(organization_id, created_at desc);

alter table public.property_guest_devices enable row level security;

drop policy if exists "Admins can read property guest devices" on public.property_guest_devices;
create policy "Admins can read property guest devices"
  on public.property_guest_devices
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members
      where organization_members.organization_id = property_guest_devices.organization_id
        and organization_members.profile_id = auth.uid()
        and organization_members.role = 'admin'
    )
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'platform_admin'
    )
  );

drop policy if exists "Admins can manage property guest devices" on public.property_guest_devices;
create policy "Admins can manage property guest devices"
  on public.property_guest_devices
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members
      where organization_members.organization_id = property_guest_devices.organization_id
        and organization_members.profile_id = auth.uid()
        and organization_members.role = 'admin'
    )
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'platform_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members
      where organization_members.organization_id = property_guest_devices.organization_id
        and organization_members.profile_id = auth.uid()
        and organization_members.role = 'admin'
    )
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'platform_admin'
    )
  );
