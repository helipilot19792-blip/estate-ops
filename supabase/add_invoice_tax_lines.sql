alter table public.organization_invoice_settings
  add column if not exists tax_lines jsonb not null default '[]'::jsonb;

alter table public.owner_invoices
  add column if not exists tax_lines jsonb not null default '[]'::jsonb;

alter table public.owner_invoices
  drop constraint if exists owner_invoices_tax_lines_array;

alter table public.owner_invoices
  add constraint owner_invoices_tax_lines_array
  check (jsonb_typeof(tax_lines) = 'array');
