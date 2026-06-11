alter table public.turnover_jobs
  add column if not exists booking_event_id uuid references public.property_booking_events(id) on delete set null;

create index if not exists turnover_jobs_booking_event_id_idx
  on public.turnover_jobs (booking_event_id);

comment on column public.turnover_jobs.booking_event_id is
  'Linked booking event for turnover jobs created from synced booking calendars.';

with parsed_sync_jobs as (
  select
    turnover_jobs.id as job_id,
    sync_marker[1] as source,
    sync_marker[2] as external_uid
  from public.turnover_jobs
  cross join lateral regexp_matches(turnover_jobs.notes, '\[AUTO_SYNC:([^:]+):([^\]]+)\]') as sync_marker
  where turnover_jobs.booking_event_id is null
    and turnover_jobs.notes like '%[AUTO_SYNC:%'
)
update public.turnover_jobs
set booking_event_id = property_booking_events.id
from parsed_sync_jobs
join public.property_booking_events
  on property_booking_events.source = parsed_sync_jobs.source
  and property_booking_events.external_uid = parsed_sync_jobs.external_uid
where turnover_jobs.id = parsed_sync_jobs.job_id
  and property_booking_events.property_id = turnover_jobs.property_id;
