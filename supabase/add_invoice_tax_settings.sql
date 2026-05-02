alter table public.organization_invoice_settings
  add column if not exists tax_label text,
  add column if not exists tax_rate numeric(7, 3) not null default 0;

alter table public.owner_invoices
  add column if not exists tax_label text,
  add column if not exists tax_rate numeric(7, 3) not null default 0;
