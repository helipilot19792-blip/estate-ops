create table if not exists public.cancelled_turnover_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  original_job_id uuid not null unique,
  booking_event_id uuid,
  scheduled_for date not null,
  source text,
  guest_summary text,
  job_notes text,
  assigned_cleaner_account_ids uuid[] not null default '{}',
  assigned_cleaner_names text[] not null default '{}',
  assignment_snapshot jsonb not null default '[]'::jsonb,
  cancelled_at timestamptz not null default now()
);

create index if not exists cancelled_turnover_jobs_org_date_idx
  on public.cancelled_turnover_jobs (organization_id, scheduled_for desc);

create index if not exists cancelled_turnover_jobs_property_date_idx
  on public.cancelled_turnover_jobs (property_id, scheduled_for desc);

alter table public.cancelled_turnover_jobs enable row level security;

grant select on public.cancelled_turnover_jobs to authenticated;

drop policy if exists "Admins can read cancelled turnover jobs" on public.cancelled_turnover_jobs;
create policy "Admins can read cancelled turnover jobs"
on public.cancelled_turnover_jobs
for select
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = cancelled_turnover_jobs.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

comment on table public.cancelled_turnover_jobs is
  'Durable admin history for calendar-synced cleaning jobs removed after a guest cancellation.';
