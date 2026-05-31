alter table public.property_booking_events
  add column if not exists admin_note_important boolean not null default false;

comment on column public.property_booking_events.admin_note_important is
  'Highlights internal admin booking notes in operations views when true.';
