create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject text,
  context_type text not null default 'direct',
  context_id uuid,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  participant_type text not null,
  participant_profile_id uuid references public.profiles(id) on delete cascade,
  participant_owner_account_id uuid references public.owner_accounts(id) on delete cascade,
  participant_role text,
  display_name text,
  email text,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chat_participants_type_check check (participant_type in ('profile', 'owner')),
  constraint chat_participants_target_check check (
    (participant_type = 'profile' and participant_profile_id is not null and participant_owner_account_id is null)
    or
    (participant_type = 'owner' and participant_owner_account_id is not null and participant_profile_id is null)
  )
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversations_org_updated_idx
  on public.chat_conversations (organization_id, updated_at desc);

create index if not exists chat_participants_conversation_idx
  on public.chat_participants (conversation_id);

create index if not exists chat_participants_profile_idx
  on public.chat_participants (participant_profile_id);

create index if not exists chat_participants_owner_idx
  on public.chat_participants (participant_owner_account_id);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at asc);

create or replace function public.touch_chat_conversation_from_message()
returns trigger
language plpgsql
as $$
begin
  update public.chat_conversations
  set last_message_at = new.created_at,
      updated_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists touch_chat_conversation_on_message on public.chat_messages;
create trigger touch_chat_conversation_on_message
after insert on public.chat_messages
for each row execute function public.touch_chat_conversation_from_message();

create or replace function public.is_chat_participant(conversation_id_to_check uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_participants
    left join public.owner_accounts
      on owner_accounts.id = chat_participants.participant_owner_account_id
    where chat_participants.conversation_id = conversation_id_to_check
      and (
        chat_participants.participant_profile_id = auth.uid()
        or owner_accounts.profile_id = auth.uid()
      )
  );
$$;

grant execute on function public.is_chat_participant(uuid) to authenticated;

create or replace function public.mark_chat_conversation_read(conversation_id_to_mark uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_participants
  set last_read_at = now()
  where conversation_id = conversation_id_to_mark
    and (
      participant_profile_id = auth.uid()
      or exists (
        select 1
        from public.owner_accounts
        where owner_accounts.id = chat_participants.participant_owner_account_id
          and owner_accounts.profile_id = auth.uid()
      )
    );
end;
$$;

grant execute on function public.mark_chat_conversation_read(uuid) to authenticated;

alter table public.chat_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end;
$$;

alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Admins can manage organization chat conversations" on public.chat_conversations;
create policy "Admins can manage organization chat conversations"
on public.chat_conversations
for all
using (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = chat_conversations.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = chat_conversations.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
);

drop policy if exists "Participants can view chat conversations" on public.chat_conversations;
create policy "Participants can view chat conversations"
on public.chat_conversations
for select
using (public.is_chat_participant(chat_conversations.id));

drop policy if exists "Admins can manage organization chat participants" on public.chat_participants;
create policy "Admins can manage organization chat participants"
on public.chat_participants
for all
using (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = chat_participants.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = chat_participants.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
);

drop policy if exists "Participants can view chat participants" on public.chat_participants;
create policy "Participants can view chat participants"
on public.chat_participants
for select
using (public.is_chat_participant(chat_participants.conversation_id));

drop policy if exists "Admins can manage organization chat messages" on public.chat_messages;
create policy "Admins can manage organization chat messages"
on public.chat_messages
for all
using (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = chat_messages.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = chat_messages.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.role = 'admin'
  )
);

drop policy if exists "Participants can view chat messages" on public.chat_messages;
create policy "Participants can view chat messages"
on public.chat_messages
for select
using (public.is_chat_participant(chat_messages.conversation_id));

drop policy if exists "Participants can send chat messages" on public.chat_messages;
create policy "Participants can send chat messages"
on public.chat_messages
for insert
with check (
  sender_profile_id = auth.uid()
  and public.is_chat_participant(chat_messages.conversation_id)
);
