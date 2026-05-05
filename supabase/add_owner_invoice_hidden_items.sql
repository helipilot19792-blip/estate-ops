create table if not exists public.owner_invoice_hidden_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.owner_invoices(id) on delete cascade,
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  constraint owner_invoice_hidden_items_unique unique (invoice_id, owner_account_id)
);

create index if not exists owner_invoice_hidden_items_owner_idx
  on public.owner_invoice_hidden_items (owner_account_id, hidden_at desc);

alter table public.owner_invoice_hidden_items enable row level security;

drop policy if exists "Owners can manage their own hidden invoices" on public.owner_invoice_hidden_items;
create policy "Owners can manage their own hidden invoices"
on public.owner_invoice_hidden_items
for all
using (
  exists (
    select 1
    from public.owner_accounts
    where owner_accounts.id = owner_invoice_hidden_items.owner_account_id
      and owner_accounts.profile_id = auth.uid()
      and owner_accounts.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.owner_accounts
    where owner_accounts.id = owner_invoice_hidden_items.owner_account_id
      and owner_accounts.profile_id = auth.uid()
      and owner_accounts.is_active = true
  )
);
