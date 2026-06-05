create extension if not exists pgcrypto;

create table if not exists public.property_cleaning_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  title text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_cleaning_checklist_items_org_idx
  on public.property_cleaning_checklist_items(organization_id);

create index if not exists property_cleaning_checklist_items_property_idx
  on public.property_cleaning_checklist_items(property_id);

create table if not exists public.turnover_job_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.turnover_jobs(id) on delete cascade,
  slot_id uuid not null references public.turnover_job_slots(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  source_item_id uuid references public.property_cleaning_checklist_items(id) on delete set null,
  title text not null,
  description text,
  sort_order integer not null default 0,
  completed_at timestamptz,
  completed_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists turnover_job_checklist_items_org_idx
  on public.turnover_job_checklist_items(organization_id);

create index if not exists turnover_job_checklist_items_job_idx
  on public.turnover_job_checklist_items(job_id);

create index if not exists turnover_job_checklist_items_slot_idx
  on public.turnover_job_checklist_items(slot_id);

create unique index if not exists turnover_job_checklist_items_slot_source_uidx
  on public.turnover_job_checklist_items(slot_id, source_item_id)
  where source_item_id is not null;
