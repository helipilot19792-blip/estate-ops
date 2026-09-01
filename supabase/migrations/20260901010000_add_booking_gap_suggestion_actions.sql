create table if not exists public.booking_gap_suggestion_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  suggestion_key text not null,
  status text not null,
  snoozed_until timestamptz,
  acted_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_gap_suggestion_actions_status_valid
    check (status in ('dismissed', 'snoozed', 'handled')),
  constraint booking_gap_suggestion_actions_key_length
    check (char_length(suggestion_key) between 1 and 180),
  constraint booking_gap_suggestion_actions_unique_key
    unique (organization_id, suggestion_key)
);

create index if not exists booking_gap_suggestion_actions_org_updated_idx
  on public.booking_gap_suggestion_actions (organization_id, updated_at desc);

alter table public.booking_gap_suggestion_actions enable row level security;

drop policy if exists "Organization admins can manage booking gap actions"
  on public.booking_gap_suggestion_actions;
create policy "Organization admins can manage booking gap actions"
on public.booking_gap_suggestion_actions
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
            where organization_members.organization_id = booking_gap_suggestion_actions.organization_id
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
            where organization_members.organization_id = booking_gap_suggestion_actions.organization_id
              and organization_members.profile_id = auth.uid()
              and organization_members.role = 'admin'
          )
        )
      )
  )
);
