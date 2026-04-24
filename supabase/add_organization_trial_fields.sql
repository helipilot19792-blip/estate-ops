alter table public.organizations
  add column if not exists subscription_status text,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists billing_enabled boolean not null default false,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

update public.organizations
set
  subscription_status = coalesce(subscription_status, 'trialing'),
  trial_started_at = coalesce(trial_started_at, now()),
  trial_ends_at = coalesce(trial_ends_at, now() + interval '30 days'),
  billing_enabled = coalesce(billing_enabled, false);

alter table public.organizations
  alter column subscription_status set default 'trialing';

alter table public.organizations
  alter column subscription_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_subscription_status_check'
  ) then
    alter table public.organizations
      add constraint organizations_subscription_status_check
      check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'suspended'));
  end if;
end $$;
