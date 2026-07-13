alter table public.organization_invoice_settings
  add column if not exists billing_currency_code text not null default 'USD';

alter table public.owner_invoices
  add column if not exists currency_code text not null default 'USD';

update public.organization_invoice_settings
set billing_currency_code = 'USD'
where billing_currency_code is null
   or trim(billing_currency_code) = '';

update public.owner_invoices
set currency_code = 'USD'
where currency_code is null
   or trim(currency_code) = '';

alter table public.organization_invoice_settings
  drop constraint if exists organization_invoice_settings_billing_currency_code_check;

alter table public.organization_invoice_settings
  add constraint organization_invoice_settings_billing_currency_code_check
  check (billing_currency_code in ('USD', 'CAD'));

alter table public.owner_invoices
  drop constraint if exists owner_invoices_currency_code_check;

alter table public.owner_invoices
  add constraint owner_invoices_currency_code_check
  check (currency_code in ('USD', 'CAD'));
