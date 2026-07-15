create table if not exists public.staff_job_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_kind text not null,
  job_id uuid not null,
  account_id uuid,
  event_type text not null,
  title text not null,
  body text not null,
  url text,
  push_sent_count integer not null default 0,
  push_errors text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint staff_job_status_events_kind_check check (job_kind in ('cleaner', 'grounds')),
  constraint staff_job_status_events_type_check check (event_type in ('accepted', 'arrived', 'started', 'completed', 'release_requested', 'overdue_offer'))
);

create index if not exists staff_job_status_events_org_created_idx
  on public.staff_job_status_events (organization_id, created_at desc);

create index if not exists staff_job_status_events_job_idx
  on public.staff_job_status_events (job_kind, job_id, created_at desc);

alter table public.staff_job_status_events enable row level security;

drop policy if exists "Admins can read staff job status events" on public.staff_job_status_events;
create policy "Admins can read staff job status events"
on public.staff_job_status_events
for select
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = staff_job_status_events.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can insert staff job status events" on public.staff_job_status_events;
create policy "Admins can insert staff job status events"
on public.staff_job_status_events
for insert
with check (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = staff_job_status_events.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);
