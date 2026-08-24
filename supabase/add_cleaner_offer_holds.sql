alter table public.properties
  add column if not exists cleaner_offer_lead_days integer not null default 90;

alter table public.properties
  drop constraint if exists properties_cleaner_offer_lead_days_check;

alter table public.properties
  add constraint properties_cleaner_offer_lead_days_check
  check (cleaner_offer_lead_days in (60, 90, 180));

alter table public.turnover_jobs
  add column if not exists cleaner_offer_lead_days integer not null default 90,
  add column if not exists cleaner_offer_uses_property_default boolean not null default true,
  add column if not exists offer_eligible_at date,
  add column if not exists offer_held_at timestamptz,
  add column if not exists offer_released_at timestamptz;

alter table public.turnover_jobs
  drop constraint if exists turnover_jobs_cleaner_offer_lead_days_check;

alter table public.turnover_jobs
  add constraint turnover_jobs_cleaner_offer_lead_days_check
  check (cleaner_offer_lead_days in (0, 60, 90, 180));

alter table public.turnover_jobs
  drop constraint if exists turnover_jobs_staffing_status_check;

alter table public.turnover_jobs
  add constraint turnover_jobs_staffing_status_check
  check (staffing_status in (
    'unfilled',
    'partially_filled',
    'ready',
    'fully_staffed',
    'stranded',
    'held',
    'releasing'
  ));

create index if not exists turnover_jobs_held_offer_release_idx
  on public.turnover_jobs (offer_eligible_at, property_id)
  where staffing_status = 'held';

comment on column public.properties.cleaner_offer_lead_days is
  'Days before a cleaning when cleaner offers may be released. Allowed values: 60, 90, 180.';

comment on column public.turnover_jobs.cleaner_offer_uses_property_default is
  'True when property lead-time changes should recalculate this job hold.';
