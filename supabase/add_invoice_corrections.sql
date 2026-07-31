alter table public.owner_invoices
  add column if not exists corrected_invoice_id uuid references public.owner_invoices(id) on delete set null,
  add column if not exists corrected_invoice_number text;

create index if not exists owner_invoices_corrected_invoice_id_idx
  on public.owner_invoices (corrected_invoice_id);
