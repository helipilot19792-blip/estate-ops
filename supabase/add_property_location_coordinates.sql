alter table public.properties
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_latitude_range'
  ) then
    alter table public.properties
      add constraint properties_latitude_range
      check (latitude is null or (latitude >= -90 and latitude <= 90))
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_longitude_range'
  ) then
    alter table public.properties
      add constraint properties_longitude_range
      check (longitude is null or (longitude >= -180 and longitude <= 180))
      not valid;
  end if;
end $$;

create index if not exists properties_location_idx
  on public.properties (organization_id, latitude, longitude)
  where latitude is not null and longitude is not null;
