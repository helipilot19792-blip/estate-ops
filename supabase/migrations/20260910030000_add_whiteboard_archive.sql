alter table public.admin_whiteboard_tasks
  add column if not exists archived_at timestamptz;
