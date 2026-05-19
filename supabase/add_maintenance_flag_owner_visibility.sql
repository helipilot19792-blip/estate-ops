alter table public.property_maintenance_flags
  add column if not exists owner_visible_at timestamptz,
  add column if not exists owner_notified_at timestamptz,
  add column if not exists owner_notified_by_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists property_maintenance_flags_owner_visible_idx
  on public.property_maintenance_flags (property_id, owner_visible_at)
  where owner_visible_at is not null;

comment on column public.property_maintenance_flags.owner_visible_at
  is 'When set, this maintenance flag is visible in the linked owner portal.';

comment on column public.property_maintenance_flags.owner_notified_at
  is 'When set, an admin has emailed the linked owner about this maintenance flag.';

