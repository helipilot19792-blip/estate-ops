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

drop policy if exists "Participants can view chat conversations" on public.chat_conversations;
create policy "Participants can view chat conversations"
on public.chat_conversations
for select
using (public.is_chat_participant(chat_conversations.id));

drop policy if exists "Participants can view chat participants" on public.chat_participants;
create policy "Participants can view chat participants"
on public.chat_participants
for select
using (public.is_chat_participant(chat_participants.conversation_id));

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
