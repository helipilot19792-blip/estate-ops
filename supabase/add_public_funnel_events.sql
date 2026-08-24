create table if not exists public.public_funnel_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_date date not null default (timezone('utc', now())::date),
  visitor_id uuid not null,
  event_key text not null,
  path text null,
  referrer_host text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint public_funnel_events_event_key_check check (
    event_key in (
      'signup_view',
      'signup_attempt',
      'signup_account_created',
      'trial_created',
      'demo_view',
      'demo_interaction'
    )
  )
);

create unique index if not exists public_funnel_events_daily_unique_idx
  on public.public_funnel_events (event_date, visitor_id, event_key);

create index if not exists public_funnel_events_created_at_idx
  on public.public_funnel_events (created_at desc);

create index if not exists public_funnel_events_event_key_created_idx
  on public.public_funnel_events (event_key, created_at desc);

alter table public.public_funnel_events enable row level security;

comment on table public.public_funnel_events is
  'Privacy-friendly, first-party counts for the public Gulera OS signup and demo funnel. Written and read only through server routes.';
