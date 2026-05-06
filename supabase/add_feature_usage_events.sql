create table if not exists public.feature_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_profile_id uuid null references public.profiles(id) on delete set null,
  actor_role text null,
  portal text not null,
  area text not null,
  feature_key text not null,
  feature_label text not null,
  action text not null default 'open',
  path text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists feature_usage_events_created_at_idx
  on public.feature_usage_events (created_at desc);

create index if not exists feature_usage_events_organization_created_idx
  on public.feature_usage_events (organization_id, created_at desc);

create index if not exists feature_usage_events_feature_idx
  on public.feature_usage_events (feature_key, created_at desc);

create index if not exists feature_usage_events_portal_idx
  on public.feature_usage_events (portal, created_at desc);

alter table public.feature_usage_events enable row level security;

drop policy if exists "Platform admins can view feature usage" on public.feature_usage_events;
create policy "Platform admins can view feature usage"
on public.feature_usage_events
for select
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'platform_admin'
  )
);

drop policy if exists "Organization members can write feature usage" on public.feature_usage_events;
create policy "Organization members can write feature usage"
on public.feature_usage_events
for insert
with check (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = feature_usage_events.organization_id
      and organization_members.profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'platform_admin'
  )
  or exists (
    select 1
    from public.owner_accounts
    join auth.users on lower(auth.users.email) = lower(owner_accounts.email)
    where owner_accounts.organization_id = feature_usage_events.organization_id
      and auth.users.id = auth.uid()
  )
);
