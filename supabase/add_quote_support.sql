alter table public.owner_invoices
  alter column owner_account_id drop not null;

alter table public.owner_invoices
  add column if not exists document_kind text not null default 'invoice',
  add column if not exists prospect_name text,
  add column if not exists prospect_email text,
  add column if not exists prospect_phone text,
  add column if not exists property_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists accepted_property_id uuid references public.properties(id) on delete set null;

update public.owner_invoices
set document_kind = case
  when upper(coalesce(invoice_number, '')) like 'STMT-%' then 'statement'
  when upper(coalesce(invoice_number, '')) like 'QUO-%' then 'quote'
  else 'invoice'
end
where document_kind is null
   or document_kind = 'invoice';

alter table public.owner_invoices
  drop constraint if exists owner_invoices_status_check;

alter table public.owner_invoices
  add constraint owner_invoices_status_check
  check (status in ('draft', 'sent', 'paid', 'void', 'accepted', 'declined', 'expired'));

alter table public.owner_invoices
  drop constraint if exists owner_invoices_document_kind_check;

alter table public.owner_invoices
  add constraint owner_invoices_document_kind_check
  check (document_kind in ('invoice', 'statement', 'quote'));

alter table public.owner_invoices
  drop constraint if exists owner_invoices_property_snapshot_object;

alter table public.owner_invoices
  add constraint owner_invoices_property_snapshot_object
  check (jsonb_typeof(property_snapshot) = 'object');

create index if not exists owner_invoices_document_kind_idx
  on public.owner_invoices (organization_id, document_kind, created_at desc);

create index if not exists owner_invoices_accepted_property_idx
  on public.owner_invoices (accepted_property_id);
