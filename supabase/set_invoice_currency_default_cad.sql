alter table public.organization_invoice_settings
  alter column billing_currency_code set default 'CAD';

-- Existing settings were initialized from the former USD-only default.
-- Invoice records are deliberately left untouched to preserve their history.
update public.organization_invoice_settings
set billing_currency_code = 'CAD'
where billing_currency_code = 'USD';

alter table public.owner_invoices
  alter column currency_code set default 'CAD';
