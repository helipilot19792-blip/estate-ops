alter table public.owner_invoices
  add column if not exists owner_viewed_at timestamptz;

create index if not exists owner_invoices_owner_unread_idx
  on public.owner_invoices (owner_account_id, owner_viewed_at)
  where owner_viewed_at is null;
