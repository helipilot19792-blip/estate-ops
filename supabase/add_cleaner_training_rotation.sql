alter table public.properties
  add column if not exists cleaner_assignment_mode text not null default 'priority',
  add column if not exists cleaner_rotation_next_cleaner_account_id uuid references public.cleaner_accounts(id) on delete set null;

alter table public.properties
  drop constraint if exists properties_cleaner_assignment_mode_check;

alter table public.properties
  add constraint properties_cleaner_assignment_mode_check
  check (cleaner_assignment_mode in ('priority', 'training_rotation'));

