alter table public.property_invoice_rates
  add column if not exists bill_turnover_to_owner boolean not null default false,
  add column if not exists bill_grounds_to_owner boolean not null default false;

comment on column public.property_invoice_rates.bill_turnover_to_owner
  is 'When true, completed/known turnover cleaning jobs for this property can be added to owner invoices.';

comment on column public.property_invoice_rates.bill_grounds_to_owner
  is 'When true, completed/known grounds jobs for this property can be added to owner invoices.';
