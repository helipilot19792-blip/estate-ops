create table if not exists public.platform_settings (
  id boolean primary key default true check (id = true),
  ai_copilot_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, ai_copilot_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.organizations
  add column if not exists ai_copilot_enabled boolean not null default false;

alter table public.organization_members
  add column if not exists ai_copilot_enabled boolean not null default false;

alter table public.platform_settings enable row level security;

drop policy if exists "Platform admins can read platform settings" on public.platform_settings;
create policy "Platform admins can read platform settings"
on public.platform_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'platform_admin'
  )
);

drop policy if exists "Platform admins can manage platform settings" on public.platform_settings;
create policy "Platform admins can manage platform settings"
on public.platform_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'platform_admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'platform_admin'
  )
);
