create table if not exists public.staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  portal text not null check (portal in ('cleaner', 'grounds')),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (profile_id, portal, endpoint)
);

create index if not exists staff_push_subscriptions_profile_idx
  on public.staff_push_subscriptions(profile_id, portal)
  where disabled_at is null;

alter table public.staff_push_subscriptions enable row level security;

drop policy if exists "Staff can read own push subscriptions" on public.staff_push_subscriptions;
create policy "Staff can read own push subscriptions"
  on public.staff_push_subscriptions
  for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "Staff can delete own push subscriptions" on public.staff_push_subscriptions;
create policy "Staff can delete own push subscriptions"
  on public.staff_push_subscriptions
  for delete
  to authenticated
  using (profile_id = auth.uid());

grant select, insert, update, delete on public.staff_push_subscriptions to authenticated;

alter table public.turnover_job_slots
  add column if not exists offer_push_sent_at timestamptz,
  add column if not exists offer_reminder_push_sent_at timestamptz,
  add column if not exists day_of_reminder_push_sent_at timestamptz;

alter table public.grounds_job_slots
  add column if not exists offer_push_sent_at timestamptz,
  add column if not exists offer_reminder_push_sent_at timestamptz,
  add column if not exists day_of_reminder_push_sent_at timestamptz;
