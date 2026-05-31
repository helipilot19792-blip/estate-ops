alter table public.properties
  add column if not exists default_checkin_time text,
  add column if not exists default_checkout_time text;

alter table public.properties
  drop constraint if exists properties_default_checkin_time_valid;

alter table public.properties
  add constraint properties_default_checkin_time_valid
  check (default_checkin_time is null or default_checkin_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

alter table public.properties
  drop constraint if exists properties_default_checkout_time_valid;

alter table public.properties
  add constraint properties_default_checkout_time_valid
  check (default_checkout_time is null or default_checkout_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
