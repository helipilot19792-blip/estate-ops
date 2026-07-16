-- A booking arriving after a cleaner accepted multiple flexible turnovers can make the
-- original plan infeasible. These fields make that operational risk visible without
-- treating the cleaner's acceptance as a fault.
alter table public.turnover_jobs
  add column if not exists schedule_conflict_at timestamptz,
  add column if not exists schedule_conflict_group_key text,
  add column if not exists schedule_conflict_recommended boolean not null default false,
  add column if not exists schedule_conflict_reason text;

create index if not exists turnover_jobs_schedule_conflict_idx
  on public.turnover_jobs (organization_id, schedule_conflict_at desc)
  where schedule_conflict_at is not null;

comment on column public.turnover_jobs.schedule_conflict_recommended is
  'True when this is the recommended job to move to a backup cleaner for an active same-day arrival conflict.';
