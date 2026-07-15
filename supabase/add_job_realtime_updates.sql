-- Keep admin job staffing indicators current without polling the full workspace.
alter table public.turnover_jobs replica identity full;
alter table public.turnover_job_slots replica identity full;
alter table public.grounds_jobs replica identity full;
alter table public.grounds_job_slots replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.turnover_jobs;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.turnover_job_slots;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.grounds_jobs;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.grounds_job_slots;
exception
  when duplicate_object then null;
end;
$$;
