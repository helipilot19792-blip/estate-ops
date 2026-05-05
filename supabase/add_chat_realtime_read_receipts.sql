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
alter table public.chat_participants replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.chat_participants;
exception
  when duplicate_object then null;
end;
$$;
