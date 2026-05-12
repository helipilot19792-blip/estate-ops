-- Allows a newly signed-up user to create their first organization.
-- This is intentionally narrow: the user can only insert an organization
-- where created_by is their own auth user id, then insert themselves as
-- that organization's admin member.

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists "Users can create their own organization" on public.organizations;
create policy "Users can create their own organization"
on public.organizations
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "Creators can read their new organization" on public.organizations;
create policy "Creators can read their new organization"
on public.organizations
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = organizations.id
      and organization_members.profile_id = auth.uid()
  )
);

drop policy if exists "Creators can delete unjoined organization" on public.organizations;
create policy "Creators can delete unjoined organization"
on public.organizations
for delete
to authenticated
using (created_by = auth.uid());

drop policy if exists "Users can add themselves as first organization admin" on public.organization_members;
create policy "Users can add themselves as first organization admin"
on public.organization_members
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and role = 'admin'
  and exists (
    select 1
    from public.organizations
    where organizations.id = organization_members.organization_id
      and organizations.created_by = auth.uid()
  )
);

drop policy if exists "Users can read their own organization memberships" on public.organization_members;
create policy "Users can read their own organization memberships"
on public.organization_members
for select
to authenticated
using (profile_id = auth.uid());
