-- Match the compound filters and ordering used by the portal's initial and
-- section-scoped dashboard queries. Foreign keys do not automatically create
-- indexes in Postgres, so the child lookups need explicit coverage too.

create index if not exists properties_org_created_idx
  on public.properties (organization_id, created_at desc);

create index if not exists cleaner_accounts_org_created_idx
  on public.cleaner_accounts (organization_id, created_at desc);

create index if not exists grounds_accounts_org_created_idx
  on public.grounds_accounts (organization_id, created_at desc);

create index if not exists turnover_jobs_org_scheduled_idx
  on public.turnover_jobs (organization_id, scheduled_for);

create index if not exists turnover_jobs_org_staffing_idx
  on public.turnover_jobs (organization_id, staffing_status, scheduled_for);

create index if not exists grounds_jobs_org_scheduled_idx
  on public.grounds_jobs (organization_id, scheduled_for);

create index if not exists property_booking_events_org_dates_idx
  on public.property_booking_events (organization_id, checkin_date, checkout_date);

create index if not exists property_maintenance_flags_org_created_idx
  on public.property_maintenance_flags (organization_id, created_at desc);

create index if not exists property_maintenance_flags_org_status_idx
  on public.property_maintenance_flags (organization_id, status, created_at desc);

create index if not exists cleaner_account_members_account_created_idx
  on public.cleaner_account_members (cleaner_account_id, created_at desc);

create index if not exists grounds_account_members_account_created_idx
  on public.grounds_account_members (grounds_account_id, created_at desc);

create index if not exists turnover_job_slots_job_idx
  on public.turnover_job_slots (job_id);

create index if not exists grounds_job_slots_job_idx
  on public.grounds_job_slots (job_id);
