create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_profile_id uuid null references public.profiles(id) on delete set null,
  actor_email text null,
  actor_role text null,
  organization_id uuid null references public.organizations(id) on delete set null,
  action_type text not null,
  target_type text null,
  target_id text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create index if not exists audit_logs_organization_id_idx
  on public.audit_logs (organization_id);

create index if not exists audit_logs_action_type_idx
  on public.audit_logs (action_type);

alter table public.audit_logs enable row level security;

drop policy if exists "Platform admins can view audit logs" on public.audit_logs;
create policy "Platform admins can view audit logs"
on public.audit_logs
for select
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'platform_admin'
  )
);
