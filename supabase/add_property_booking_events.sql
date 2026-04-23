create table if not exists public.property_booking_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  property_calendar_id uuid references public.property_calendars(id) on delete set null,
  source text not null,
  external_uid text not null,
  summary text,
  checkin_date date not null,
  checkout_date date not null,
  raw_dtstart text,
  raw_dtend text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_booking_events_valid_dates check (checkout_date > checkin_date),
  constraint property_booking_events_unique_source_uid unique (property_id, source, external_uid)
);

create index if not exists property_booking_events_property_dates_idx
  on public.property_booking_events (property_id, checkin_date, checkout_date);

alter table public.property_booking_events enable row level security;

drop policy if exists "Admins can manage booking events" on public.property_booking_events;
create policy "Admins can manage booking events"
on public.property_booking_events
for all
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);

drop policy if exists "Owners can view linked booking events" on public.property_booking_events;
create policy "Owners can view linked booking events"
on public.property_booking_events
for select
using (
  exists (
    select 1
    from public.owner_accounts
    join public.owner_property_access
      on owner_property_access.owner_account_id = owner_accounts.id
    where owner_accounts.profile_id = auth.uid()
      and owner_accounts.is_active = true
      and owner_property_access.property_id = property_booking_events.property_id
  )
);
