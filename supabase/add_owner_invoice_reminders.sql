alter table public.organization_invoice_settings
  add column if not exists invoice_reminders_enabled boolean not null default false,
  add column if not exists invoice_reminder_days_after_sent integer not null default 15,
  add column if not exists invoice_reminder_repeat_days integer not null default 15,
  add column if not exists invoice_reminder_max_count integer not null default 3;

alter table public.owner_invoices
  add column if not exists last_reminder_sent_at timestamptz,
  add column if not exists reminder_count integer not null default 0;

create table if not exists public.owner_invoice_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.owner_invoices(id) on delete cascade,
  event_type text not null,
  recipient_email text,
  cc_emails text[] not null default '{}'::text[],
  resend_email_id text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint owner_invoice_events_type_check check (
    event_type in ('invoice_sent', 'invoice_resent', 'reminder_sent', 'auto_reminder_sent', 'marked_paid', 'marked_unpaid')
  )
);

create index if not exists owner_invoice_events_invoice_created_idx
  on public.owner_invoice_events (invoice_id, created_at desc);

create index if not exists owner_invoice_events_org_created_idx
  on public.owner_invoice_events (organization_id, created_at desc);

alter table public.owner_invoice_events enable row level security;

drop policy if exists "Admins can read owner invoice events" on public.owner_invoice_events;
create policy "Admins can read owner invoice events"
on public.owner_invoice_events
for select
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = owner_invoice_events.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can manage owner invoice events" on public.owner_invoice_events;
create policy "Admins can manage owner invoice events"
on public.owner_invoice_events
for insert
with check (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = owner_invoice_events.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);
