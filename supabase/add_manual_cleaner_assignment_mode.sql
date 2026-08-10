alter table public.properties
  drop constraint if exists properties_cleaner_assignment_mode_check;

alter table public.properties
  add constraint properties_cleaner_assignment_mode_check
  check (cleaner_assignment_mode in ('priority', 'training_rotation', 'manual'));

comment on column public.properties.cleaner_assignment_mode is
  'Cleaner routing mode: priority auto-offers, training_rotation rotates offers, and manual waits for an admin to choose a property-assigned cleaner.';
