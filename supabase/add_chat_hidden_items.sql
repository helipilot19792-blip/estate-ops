create table if not exists public.chat_hidden_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete cascade,
  hidden_by_profile_id uuid references public.profiles(id) on delete cascade,
  hidden_by_owner_account_id uuid references public.owner_accounts(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  constraint chat_hidden_items_owner_check check (
    (hidden_by_profile_id is not null and hidden_by_owner_account_id is null)
    or
    (hidden_by_profile_id is null and hidden_by_owner_account_id is not null)
  )
);

create unique index if not exists chat_hidden_conversation_profile_idx
  on public.chat_hidden_items (conversation_id, hidden_by_profile_id)
  where message_id is null and hidden_by_profile_id is not null;

create unique index if not exists chat_hidden_conversation_owner_idx
  on public.chat_hidden_items (conversation_id, hidden_by_owner_account_id)
  where message_id is null and hidden_by_owner_account_id is not null;

create unique index if not exists chat_hidden_message_profile_idx
  on public.chat_hidden_items (message_id, hidden_by_profile_id)
  where message_id is not null and hidden_by_profile_id is not null;

create unique index if not exists chat_hidden_message_owner_idx
  on public.chat_hidden_items (message_id, hidden_by_owner_account_id)
  where message_id is not null and hidden_by_owner_account_id is not null;

create index if not exists chat_hidden_items_profile_idx
  on public.chat_hidden_items (hidden_by_profile_id, hidden_at desc);

create index if not exists chat_hidden_items_owner_idx
  on public.chat_hidden_items (hidden_by_owner_account_id, hidden_at desc);

alter table public.chat_hidden_items enable row level security;

drop policy if exists "Participants can manage their own hidden chat items" on public.chat_hidden_items;
create policy "Participants can manage their own hidden chat items"
on public.chat_hidden_items
for all
using (
  (
    hidden_by_profile_id = auth.uid()
    or exists (
      select 1
      from public.owner_accounts
      where owner_accounts.id = chat_hidden_items.hidden_by_owner_account_id
        and owner_accounts.profile_id = auth.uid()
    )
  )
  and public.is_chat_participant(chat_hidden_items.conversation_id)
)
with check (
  (
    hidden_by_profile_id = auth.uid()
    or exists (
      select 1
      from public.owner_accounts
      where owner_accounts.id = chat_hidden_items.hidden_by_owner_account_id
        and owner_accounts.profile_id = auth.uid()
    )
  )
  and public.is_chat_participant(chat_hidden_items.conversation_id)
);
