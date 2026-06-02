create table if not exists public.property_vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  vendor_name text not null,
  category text,
  contact_name text,
  phone text,
  email text,
  website text,
  emergency_available boolean not null default false,
  preferred boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_vendors_property_idx
  on public.property_vendors (property_id, vendor_name);

create index if not exists property_vendors_org_idx
  on public.property_vendors (organization_id, vendor_name);

alter table public.property_vendors enable row level security;

drop policy if exists "Admins can read property vendors" on public.property_vendors;
create policy "Admins can read property vendors"
on public.property_vendors
for select
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = property_vendors.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can manage property vendors" on public.property_vendors;
create policy "Admins can manage property vendors"
on public.property_vendors
for all
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = property_vendors.organization_id
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
      and organization_members.organization_id = property_vendors.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);
