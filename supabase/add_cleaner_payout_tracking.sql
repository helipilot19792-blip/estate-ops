alter table public.properties
  add column if not exists default_turnover_payout numeric(10, 2) not null default 0;

alter table public.turnover_job_slots
  add column if not exists payout_type text not null default 'standard',
  add column if not exists expected_payout_amount numeric(10, 2) not null default 0,
  add column if not exists paid_amount numeric(10, 2),
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payout_notes text,
  add column if not exists payment_notes text,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_recorded_by_profile_id uuid references public.profiles(id) on delete set null;

alter table public.turnover_job_slots
  drop constraint if exists turnover_job_slots_payout_type_check;

alter table public.turnover_job_slots
  add constraint turnover_job_slots_payout_type_check
  check (payout_type in ('standard', 'hourly', 'light_clean', 'extra_clean', 'custom'));

alter table public.turnover_job_slots
  drop constraint if exists turnover_job_slots_payment_status_check;

alter table public.turnover_job_slots
  add constraint turnover_job_slots_payment_status_check
  check (payment_status in ('unpaid', 'partial', 'paid'));

create table if not exists public.cleaner_payment_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  cleaner_account_id uuid references public.cleaner_accounts(id) on delete set null,
  job_id uuid references public.turnover_jobs(id) on delete set null,
  slot_id uuid references public.turnover_job_slots(id) on delete set null,
  payout_type text not null default 'standard',
  expected_payout_amount numeric(10, 2) not null default 0,
  paid_amount numeric(10, 2),
  payment_status text not null default 'unpaid',
  payout_notes text,
  payment_notes text,
  paid_at timestamptz,
  recorded_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.cleaner_payment_records
  drop constraint if exists cleaner_payment_records_payout_type_check;

alter table public.cleaner_payment_records
  add constraint cleaner_payment_records_payout_type_check
  check (payout_type in ('standard', 'hourly', 'light_clean', 'extra_clean', 'custom'));

alter table public.cleaner_payment_records
  drop constraint if exists cleaner_payment_records_payment_status_check;

alter table public.cleaner_payment_records
  add constraint cleaner_payment_records_payment_status_check
  check (payment_status in ('unpaid', 'partial', 'paid'));

create index if not exists cleaner_payment_records_org_created_idx
  on public.cleaner_payment_records (organization_id, created_at desc);

create index if not exists cleaner_payment_records_cleaner_created_idx
  on public.cleaner_payment_records (cleaner_account_id, created_at desc);

create index if not exists cleaner_payment_records_job_idx
  on public.cleaner_payment_records (job_id);

alter table public.cleaner_payment_records enable row level security;

drop policy if exists "Admins can manage cleaner payment records" on public.cleaner_payment_records;
create policy "Admins can manage cleaner payment records"
on public.cleaner_payment_records
for all
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = cleaner_payment_records.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = cleaner_payment_records.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

update public.turnover_job_slots
set
  expected_payout_amount = coalesce(properties.default_turnover_payout, 0),
  payout_type = coalesce(turnover_job_slots.payout_type, 'standard'),
  payment_status = coalesce(turnover_job_slots.payment_status, 'unpaid')
from public.turnover_jobs
join public.properties
  on properties.id = turnover_jobs.property_id
where turnover_jobs.id = turnover_job_slots.job_id
  and coalesce(turnover_job_slots.expected_payout_amount, 0) = 0;
