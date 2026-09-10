begin;
lock table public.admin_whiteboard_tasks in share row exclusive mode;
drop trigger if exists whiteboard_order_lock on public.admin_whiteboard_tasks;
drop trigger if exists whiteboard_order on public.admin_whiteboard_tasks;
alter table public.admin_whiteboard_tasks add column if not exists priority integer;
alter table public.admin_whiteboard_tasks add column if not exists urgency text not null default 'normal'
  check (urgency in ('normal', 'high', 'super_hot'));

-- Serialize ordering writes before acquiring row locks, including simultaneous
-- moves by different admins. Reads remain unaffected.
create or replace function public.lock_whiteboard_order() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(60910070000);
  return null;
end;
$$;

-- Normalize existing duplicate numbers before installing the reorder trigger.
with ranked as (
  select id, row_number() over (partition by organization_id order by priority, created_at, id)::integer as position
  from public.admin_whiteboard_tasks where completed_at is null and priority is not null
)
update public.admin_whiteboard_tasks t set priority = r.position from ranked r where t.id = r.id;
update public.admin_whiteboard_tasks set priority = null where completed_at is not null;

create or replace function public.reorder_whiteboard_tasks() returns trigger
language plpgsql set search_path = public as $$
declare
  org uuid;
  target uuid;
  requested integer;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if TG_OP = 'DELETE' then
    org := OLD.organization_id;
    target := OLD.id;
  else
    org := NEW.organization_id;
    target := NEW.id;
    if NEW.completed_at is null then requested := NEW.priority; end if;
  end if;
  -- Compact the other numbered tasks, insert at the requested position, and
  -- clamp positions beyond the end. Blank priority leaves a task unnumbered.
  with others as (
    select id, row_number() over (order by priority, created_at, id)::integer as position
    from public.admin_whiteboard_tasks
    where organization_id = org and completed_at is null and priority is not null and id <> target
  ), insertion as (
    select least(requested, (select count(*)::integer + 1 from others)) as position
  ), positions as (
    select o.id, o.position + case when requested is not null and o.position >= i.position then 1 else 0 end as position
    from others o cross join insertion i
    union all
    select target, case when requested is not null then (select position from insertion) else null end
  )
  update public.admin_whiteboard_tasks t set priority = p.position
  from positions p where t.id = p.id and t.organization_id = org and t.priority is distinct from p.position;
  return null;
end;
$$;
drop trigger if exists whiteboard_order_lock on public.admin_whiteboard_tasks;
create trigger whiteboard_order_lock before insert or update or delete on public.admin_whiteboard_tasks
for each statement execute function public.lock_whiteboard_order();
drop trigger if exists whiteboard_order on public.admin_whiteboard_tasks;
create trigger whiteboard_order after insert or update of priority, completed_at or delete on public.admin_whiteboard_tasks
for each row execute function public.reorder_whiteboard_tasks();
commit;
