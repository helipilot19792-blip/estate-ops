create table if not exists public.organization_invoice_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  company_name text,
  logo_url text,
  from_email text,
  reply_to_email text,
  header_text text,
  default_turnover_rate numeric(10, 2) not null default 0,
  default_grounds_rate numeric(10, 2) not null default 0,
  tax_label text,
  tax_rate numeric(7, 3) not null default 0,
  tax_lines jsonb not null default '[]'::jsonb,
  auto_add_turnover boolean not null default true,
  auto_add_grounds boolean not null default true,
  payment_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('invoice-assets', 'invoice-assets', true)
on conflict (id) do update set public = true;

create table if not exists public.property_invoice_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  turnover_rate numeric(10, 2) not null default 0,
  grounds_rate numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_invoice_rates_unique_property unique (property_id)
);

create table if not exists public.owner_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  invoice_number text not null,
  status text not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  company_name text,
  logo_url text,
  from_email text,
  reply_to_email text,
  header_text text,
  notes text,
  payment_instructions text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(10, 2) not null default 0,
  tax_label text,
  tax_rate numeric(7, 3) not null default 0,
  tax_lines jsonb not null default '[]'::jsonb,
  tax_total numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  sent_at timestamptz,
  sent_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_invoices_status_check check (status in ('draft', 'sent', 'paid', 'void')),
  constraint owner_invoices_tax_lines_array check (jsonb_typeof(tax_lines) = 'array'),
  constraint owner_invoices_line_items_array check (jsonb_typeof(line_items) = 'array')
);

alter table public.organization_invoice_settings
  add column if not exists from_email text,
  add column if not exists reply_to_email text,
  add column if not exists tax_label text,
  add column if not exists tax_rate numeric(7, 3) not null default 0,
  add column if not exists tax_lines jsonb not null default '[]'::jsonb;

alter table public.owner_invoices
  add column if not exists from_email text,
  add column if not exists reply_to_email text,
  add column if not exists tax_label text,
  add column if not exists tax_rate numeric(7, 3) not null default 0,
  add column if not exists tax_lines jsonb not null default '[]'::jsonb;

create unique index if not exists owner_invoices_org_invoice_number_idx
  on public.owner_invoices (organization_id, invoice_number);

create index if not exists owner_invoices_owner_status_idx
  on public.owner_invoices (owner_account_id, status, issue_date desc);

create index if not exists owner_invoices_property_idx
  on public.owner_invoices (property_id);

alter table public.organization_invoice_settings enable row level security;
alter table public.property_invoice_rates enable row level security;
alter table public.owner_invoices enable row level security;

drop policy if exists "Admins can upload invoice assets" on storage.objects;
create policy "Admins can upload invoice assets"
on storage.objects
for insert
with check (
  bucket_id = 'invoice-assets'
  and exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can update invoice assets" on storage.objects;
create policy "Admins can update invoice assets"
on storage.objects
for update
using (
  bucket_id = 'invoice-assets'
  and exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
)
with check (bucket_id = 'invoice-assets');

drop policy if exists "Admins can read invoice assets" on storage.objects;
create policy "Admins can read invoice assets"
on storage.objects
for select
using (
  bucket_id = 'invoice-assets'
  and exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

insert into public.property_invoice_rates (
  organization_id,
  property_id,
  turnover_rate,
  grounds_rate
)
select
  properties.organization_id,
  properties.id,
  coalesce(organization_invoice_settings.default_turnover_rate, 0),
  coalesce(organization_invoice_settings.default_grounds_rate, 0)
from public.properties
left join public.organization_invoice_settings
  on organization_invoice_settings.organization_id = properties.organization_id
on conflict (property_id) do nothing;

drop policy if exists "Admins can manage invoice settings" on public.organization_invoice_settings;
create policy "Admins can manage invoice settings"
on public.organization_invoice_settings
for all
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = organization_invoice_settings.organization_id
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
      and organization_members.organization_id = organization_invoice_settings.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can manage property invoice rates" on public.property_invoice_rates;
create policy "Admins can manage property invoice rates"
on public.property_invoice_rates
for all
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = property_invoice_rates.organization_id
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
      and organization_members.organization_id = property_invoice_rates.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Admins can manage owner invoices" on public.owner_invoices;
create policy "Admins can manage owner invoices"
on public.owner_invoices
for all
using (
  exists (
    select 1
    from public.profiles
    left join public.organization_members
      on organization_members.profile_id = profiles.id
      and organization_members.organization_id = owner_invoices.organization_id
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
      and organization_members.organization_id = owner_invoices.organization_id
    where profiles.id = auth.uid()
      and (
        profiles.role = 'platform_admin'
        or organization_members.role = 'admin'
      )
  )
);

drop policy if exists "Owners can view sent linked invoices" on public.owner_invoices;
create policy "Owners can view sent linked invoices"
on public.owner_invoices
for select
using (
  status in ('sent', 'paid')
  and exists (
    select 1
    from public.owner_accounts
    where owner_accounts.id = owner_invoices.owner_account_id
      and owner_accounts.profile_id = auth.uid()
      and owner_accounts.is_active = true
  )
);
