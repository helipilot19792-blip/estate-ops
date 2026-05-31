alter table public.property_booking_events
  add column if not exists admin_note text;

alter table public.property_booking_events
  drop constraint if exists property_booking_events_admin_note_length;

alter table public.property_booking_events
  add constraint property_booking_events_admin_note_length
  check (admin_note is null or char_length(admin_note) <= 1000);

comment on column public.property_booking_events.admin_note is
  'Internal admin note shown on admin operations glance booking cards.';
