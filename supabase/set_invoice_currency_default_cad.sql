begin;

alter table public.organization_invoice_settings
  alter column billing_currency_code set default 'CAD';

-- Preserve each organization's saved currency preference, including USD.
-- Admins can choose CAD in the Default invoice currency control.

alter table public.owner_invoices
  alter column currency_code set default 'CAD';

commit;
