alter table public.properties
  add column if not exists wifi_network text,
  add column if not exists wifi_password text,
  add column if not exists garbage_day text,
  add column if not exists garbage_notes text;

create table if not exists public.property_inspection_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null default 'Monthly safety inspection',
  frequency_type text not null default 'monthly',
  interval_count integer not null default 1,
  next_due_date date not null default current_date,
  active boolean not null default true,
  checks jsonb not null default '[]'::jsonb,
  notes text,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_inspection_rules_frequency_check
    check (frequency_type in ('weekly', 'monthly', 'quarterly', 'yearly', 'custom_days')),
  constraint property_inspection_rules_interval_check
    check (interval_count > 0 and interval_count <= 365)
);

create index if not exists property_inspection_rules_org_due_idx
  on public.property_inspection_rules (organization_id, active, next_due_date);

create index if not exists property_inspection_rules_property_idx
  on public.property_inspection_rules (property_id, active, next_due_date);

create table if not exists public.property_inspection_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  rule_id uuid references public.property_inspection_rules(id) on delete set null,
  inspection_title text not null,
  inspected_at timestamptz not null default now(),
  inspected_by_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'completed',
  check_results jsonb not null default '[]'::jsonb,
  notes text,
  next_due_date date,
  created_at timestamptz not null default now(),
  constraint property_inspection_logs_status_check
    check (status in ('completed', 'needs_attention'))
);

create index if not exists property_inspection_logs_org_date_idx
  on public.property_inspection_logs (organization_id, inspected_at desc);

create index if not exists property_inspection_logs_property_date_idx
  on public.property_inspection_logs (property_id, inspected_at desc);

create table if not exists public.property_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_log_id uuid not null references public.property_inspection_logs(id) on delete cascade,
  image_url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists property_inspection_photos_log_idx
  on public.property_inspection_photos (inspection_log_id, sort_order);

alter table public.property_inspection_rules enable row level security;
alter table public.property_inspection_logs enable row level security;
alter table public.property_inspection_photos enable row level security;

drop policy if exists "Admins can manage property inspection rules" on public.property_inspection_rules;
create policy "Admins can manage property inspection rules"
on public.property_inspection_rules
for all
to authenticated
using (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = property_inspection_rules.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = property_inspection_rules.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
);

drop policy if exists "Admins can manage property inspection logs" on public.property_inspection_logs;
create policy "Admins can manage property inspection logs"
on public.property_inspection_logs
for all
to authenticated
using (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = property_inspection_logs.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = property_inspection_logs.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
);

drop policy if exists "Admins can manage property inspection photos" on public.property_inspection_photos;
create policy "Admins can manage property inspection photos"
on public.property_inspection_photos
for all
to authenticated
using (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = property_inspection_photos.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = property_inspection_photos.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
);
