create table if not exists public.property_knowledge (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  wifi_network text,
  wifi_password text,
  access_summary text,
  lockbox_location text,
  water_shutoff_location text,
  electrical_panel_location text,
  trash_instructions text,
  owner_preferences text,
  cleaner_notes text,
  maintenance_notes text,
  appliance_notes text,
  emergency_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id)
);

create index if not exists property_knowledge_org_idx
  on public.property_knowledge (organization_id);

create index if not exists property_knowledge_property_idx
  on public.property_knowledge (property_id);

alter table public.property_knowledge enable row level security;

drop policy if exists "Admins can read property knowledge" on public.property_knowledge;
create policy "Admins can read property knowledge"
on public.property_knowledge
for select
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = property_knowledge.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can manage property knowledge" on public.property_knowledge;
create policy "Admins can manage property knowledge"
on public.property_knowledge
for all
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = property_knowledge.organization_id
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
      and organization_members.organization_id = property_knowledge.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);
