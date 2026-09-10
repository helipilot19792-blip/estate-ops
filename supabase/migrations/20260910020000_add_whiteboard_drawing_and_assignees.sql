alter table public.admin_whiteboard_tasks
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

create table if not exists public.admin_whiteboard_drawings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  strokes jsonb not null default '[]'::jsonb check (jsonb_typeof(strokes) = 'array'),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.admin_whiteboard_drawings enable row level security;
revoke all on public.admin_whiteboard_drawings from anon, authenticated;
grant select on public.admin_whiteboard_drawings to authenticated;
grant all on public.admin_whiteboard_drawings to service_role;
drop policy if exists "Organization admins can read their drawing" on public.admin_whiteboard_drawings;
create policy "Organization admins can read their drawing"
on public.admin_whiteboard_drawings for select to authenticated
using (
  exists (
    select 1 from public.organization_members m
    join public.profiles p on p.id = m.profile_id
    where m.organization_id = admin_whiteboard_drawings.organization_id
      and m.profile_id = auth.uid() and m.role = 'admin'
      and p.role in ('admin', 'platform_admin')
  )
);
