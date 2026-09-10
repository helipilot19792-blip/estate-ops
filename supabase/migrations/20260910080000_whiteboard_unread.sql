create table if not exists public.admin_whiteboard_task_reads (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.admin_whiteboard_tasks(id) on delete cascade,
  primary key (profile_id, task_id)
);
alter table public.admin_whiteboard_task_reads enable row level security;
revoke all on public.admin_whiteboard_task_reads from anon, authenticated;
grant select, insert on public.admin_whiteboard_task_reads to authenticated;
grant all on public.admin_whiteboard_task_reads to service_role;
create policy "Admins read their own task receipts" on public.admin_whiteboard_task_reads
for select to authenticated using (profile_id = auth.uid());
create policy "Admins mark accessible tasks seen" on public.admin_whiteboard_task_reads
for insert to authenticated with check (
  profile_id = auth.uid() and exists (
    select 1 from public.admin_whiteboard_tasks t where t.id = task_id
  )
);
create or replace function public.whiteboard_unread_count(org uuid) returns bigint
language sql stable security invoker set search_path = public as $$
  select count(*) from public.admin_whiteboard_tasks t
  where t.organization_id = org and t.completed_at is null and t.created_by is distinct from auth.uid()
    and not exists (select 1 from public.admin_whiteboard_task_reads r where r.task_id=t.id and r.profile_id=auth.uid());
$$;
revoke all on function public.whiteboard_unread_count(uuid) from public, anon;
grant execute on function public.whiteboard_unread_count(uuid) to authenticated;
