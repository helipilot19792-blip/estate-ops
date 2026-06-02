create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  requester_email text,
  requester_role text,
  organization_id uuid references public.organizations(id) on delete set null,
  status text not null default 'pending',
  reason text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  admin_notes text,
  constraint account_deletion_requests_status_check check (
    status in ('pending', 'reviewing', 'completed', 'denied', 'cancelled')
  )
);

create index if not exists account_deletion_requests_profile_idx
  on public.account_deletion_requests (requester_profile_id, requested_at desc);

create index if not exists account_deletion_requests_org_idx
  on public.account_deletion_requests (organization_id, requested_at desc);

create unique index if not exists account_deletion_requests_one_open_per_profile_idx
  on public.account_deletion_requests (requester_profile_id)
  where status in ('pending', 'reviewing');

alter table public.account_deletion_requests enable row level security;

create policy "Users can read their own account deletion requests"
  on public.account_deletion_requests
  for select
  using (requester_profile_id = auth.uid());

create policy "Users can create their own account deletion request"
  on public.account_deletion_requests
  for insert
  with check (requester_profile_id = auth.uid());

create policy "Admins can read organization account deletion requests"
  on public.account_deletion_requests
  for select
  using (
    exists (
      select 1
      from public.profiles
      left join public.organization_members
        on organization_members.profile_id = profiles.id
        and organization_members.organization_id = account_deletion_requests.organization_id
      where profiles.id = auth.uid()
        and (
          profiles.role = 'platform_admin'
          or organization_members.role = 'admin'
        )
    )
  );
