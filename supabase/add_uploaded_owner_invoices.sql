alter table public.owner_invoices
  add column if not exists invoice_source text not null default 'generated',
  add column if not exists uploaded_invoice_url text,
  add column if not exists uploaded_invoice_name text,
  add column if not exists uploaded_invoice_content_type text;

alter table public.owner_invoices
  drop constraint if exists owner_invoices_source_check;

alter table public.owner_invoices
  add constraint owner_invoices_source_check
  check (invoice_source in ('generated', 'uploaded'));
