alter table public.turnover_job_slots
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists started_by_profile_id uuid references public.profiles(id),
  add column if not exists finished_by_profile_id uuid references public.profiles(id);
