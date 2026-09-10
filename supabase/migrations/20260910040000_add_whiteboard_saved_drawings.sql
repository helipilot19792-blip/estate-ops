create table if not exists public.admin_whiteboard_saved_drawings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  strokes jsonb not null default '[]'::jsonb check (jsonb_typeof(strokes) = 'array'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create index if not exists admin_whiteboard_saved_drawings_org_idx
  on public.admin_whiteboard_saved_drawings (organization_id, updated_at desc);
alter table public.admin_whiteboard_saved_drawings enable row level security;
revoke all on public.admin_whiteboard_saved_drawings from anon, authenticated;
grant select on public.admin_whiteboard_saved_drawings to authenticated;
grant all on public.admin_whiteboard_saved_drawings to service_role;
drop policy if exists "Organization admins can read saved drawings" on public.admin_whiteboard_saved_drawings;
create policy "Organization admins can read saved drawings"
on public.admin_whiteboard_saved_drawings for select to authenticated
using (
  exists (
    select 1 from public.organization_members m
    join public.profiles p on p.id = m.profile_id
    where m.organization_id = admin_whiteboard_saved_drawings.organization_id
      and m.profile_id = auth.uid() and m.role = 'admin'
      and p.role in ('admin', 'platform_admin')
  )
);
