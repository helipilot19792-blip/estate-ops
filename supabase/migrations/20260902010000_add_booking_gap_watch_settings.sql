create table if not exists public.booking_gap_watch_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_gap_watch_settings enable row level security;

drop policy if exists "Organization admins can manage booking gap watch settings"
  on public.booking_gap_watch_settings;
create policy "Organization admins can manage booking gap watch settings"
on public.booking_gap_watch_settings
for all
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or (
          profiles.role = 'admin'
          and exists (
            select 1
            from public.organization_members
            where organization_members.organization_id = booking_gap_watch_settings.organization_id
              and organization_members.profile_id = auth.uid()
              and organization_members.role = 'admin'
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or (
          profiles.role = 'admin'
          and exists (
            select 1
            from public.organization_members
            where organization_members.organization_id = booking_gap_watch_settings.organization_id
              and organization_members.profile_id = auth.uid()
              and organization_members.role = 'admin'
          )
        )
      )
  )
);
