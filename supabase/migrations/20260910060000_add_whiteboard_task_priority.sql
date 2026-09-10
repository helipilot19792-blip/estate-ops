alter table public.admin_whiteboard_tasks
  add column if not exists priority integer
  check (priority between 1 and 9999);
