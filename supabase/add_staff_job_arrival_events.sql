alter table public.staff_job_status_events
  drop constraint if exists staff_job_status_events_type_check;

alter table public.staff_job_status_events
  add constraint staff_job_status_events_type_check
  check (event_type in ('accepted', 'arrived', 'started', 'completed'));
