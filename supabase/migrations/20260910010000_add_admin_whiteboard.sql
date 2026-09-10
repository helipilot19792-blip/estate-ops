create table if not exists public.admin_whiteboard_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  notes text not null default '' check (length(notes) <= 5000),
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists admin_whiteboard_tasks_org_idx
  on public.admin_whiteboard_tasks (organization_id, created_at desc);
alter table public.admin_whiteboard_tasks enable row level security;

-- Writes go through the authenticated API. Direct reads require membership,
-- including for platform admins: this board is private to this organization.
revoke all on public.admin_whiteboard_tasks from anon, authenticated;
grant select on public.admin_whiteboard_tasks to authenticated;
grant all on public.admin_whiteboard_tasks to service_role;
create policy "Organization admins can read their whiteboard"
on public.admin_whiteboard_tasks for select to authenticated
using (
  exists (
    select 1 from public.organization_members m
    join public.profiles p on p.id = m.profile_id
    where m.organization_id = admin_whiteboard_tasks.organization_id
      and m.profile_id = auth.uid() and m.role = 'admin'
      and p.role in ('admin', 'platform_admin')
  )
);
