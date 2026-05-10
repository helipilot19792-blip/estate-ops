alter table public.property_booking_events
  add column if not exists guest_count integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'property_booking_events_guest_count_valid'
      and conrelid = 'public.property_booking_events'::regclass
  ) then
    alter table public.property_booking_events
      add constraint property_booking_events_guest_count_valid
      check (guest_count is null or (guest_count > 0 and guest_count < 100));
  end if;
end $$;
