-- Keep the lightweight admin home and its floating attention banner current without
-- reloading the complete workspace. admin_stranded_jobs is a view, so it is refreshed
-- through the already-live turnover_job_slots table rather than published directly.
alter table public.property_inspection_rules replica identity full;
alter table public.property_maintenance_flags replica identity full;
alter table public.property_booking_events replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.property_inspection_rules;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.property_maintenance_flags;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.property_booking_events;
exception when duplicate_object then null;
end $$;
