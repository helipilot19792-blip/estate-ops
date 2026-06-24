import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TEAM_BULLETIN_CONTEXT_TYPE,
  TEAM_BULLETIN_RETENTION_DAYS,
} from "@/lib/team-bulletin";

export const TEAM_BULLETIN_SUBJECT = "Team Bulletin Board";
export const TEAM_BULLETIN_TEAM_ROLES = ["admin", "cleaner", "grounds"] as const;

type ServiceClient = SupabaseClient<any, "public", any>;

type TeamMemberRow = {
  profile_id: string;
  role: string;
  profiles: Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    role?: string | null;
  }>;
};

function getParticipantDisplayName(member: TeamMemberRow) {
  const profile = member.profiles?.[0] || null;
  return profile?.full_name?.trim() || profile?.email?.trim() || member.role || "Team member";
}

async function refreshTeamBulletinConversationTimestamps(
  service: ServiceClient,
  conversationId: string
) {
  const { data: latestMessage, error: latestMessageError } = await service
    .from("chat_messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestMessageError) {
    throw new Error(latestMessageError.message);
  }

  const latestActivityAt = latestMessage?.created_at || new Date().toISOString();
  const { error: updateError } = await service
    .from("chat_conversations")
    .update({
      last_message_at: latestMessage?.created_at || null,
      updated_at: latestActivityAt,
    })
    .eq("id", conversationId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function pruneTeamBulletinMessages(
  service: ServiceClient,
  conversationId: string,
  retentionDays = TEAM_BULLETIN_RETENTION_DAYS
) {
  if (!conversationId || retentionDays <= 0) return 0;

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: staleMessages, error: staleMessagesError } = await service
    .from("chat_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .lt("created_at", cutoff);

  if (staleMessagesError) {
    throw new Error(staleMessagesError.message);
  }

  const staleMessageIds = (staleMessages ?? []).map((message) => String(message.id)).filter(Boolean);
  if (staleMessageIds.length === 0) return 0;

  const { error: deleteError } = await service.from("chat_messages").delete().in("id", staleMessageIds);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await refreshTeamBulletinConversationTimestamps(service, conversationId);
  return staleMessageIds.length;
}

export async function deleteTeamBulletinMessages(
  service: ServiceClient,
  conversationId: string,
  options: {
    messageIds?: string[];
    clearAll?: boolean;
  } = {}
) {
  if (!conversationId) return 0;

  let deleteQuery = service.from("chat_messages").delete().eq("conversation_id", conversationId);
  const uniqueMessageIds = Array.from(new Set((options.messageIds ?? []).map((id) => id.trim()).filter(Boolean)));

  if (!options.clearAll) {
    if (uniqueMessageIds.length === 0) return 0;
    deleteQuery = deleteQuery.in("id", uniqueMessageIds);
  }

  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await refreshTeamBulletinConversationTimestamps(service, conversationId);
  return options.clearAll ? -1 : uniqueMessageIds.length;
}

export async function ensureTeamBulletinConversation(
  service: ServiceClient,
  organizationId: string,
  createdByProfileId: string
) {
  const { data: existing, error: existingError } = await service
    .from("chat_conversations")
    .select("id, organization_id, subject, context_type, created_by_profile_id")
    .eq("organization_id", organizationId)
    .eq("context_type", TEAM_BULLETIN_CONTEXT_TYPE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: createError } = await service
    .from("chat_conversations")
    .insert({
      organization_id: organizationId,
      subject: TEAM_BULLETIN_SUBJECT,
      context_type: TEAM_BULLETIN_CONTEXT_TYPE,
      created_by_profile_id: createdByProfileId,
    })
    .select("id, organization_id, subject, context_type, created_by_profile_id")
    .single();

  if (createError || !created) {
    throw new Error(createError?.message || "Could not create the team bulletin board.");
  }

  return created;
}

export async function syncTeamBulletinParticipants(
  service: ServiceClient,
  organizationId: string,
  conversationId: string
) {
  const [{ data: members, error: membersError }, { data: existing, error: existingError }] = await Promise.all([
    service
      .from("organization_members")
      .select(
        `
          profile_id,
          role,
          profiles!organization_members_profile_id_fkey (
            id,
            email,
            full_name,
            role
          )
        `
      )
      .eq("organization_id", organizationId)
      .in("role", [...TEAM_BULLETIN_TEAM_ROLES])
      .order("created_at", { ascending: true }),
    service
      .from("chat_participants")
      .select(
        "id, organization_id, conversation_id, participant_type, participant_profile_id, participant_owner_account_id, participant_role, display_name, email, last_read_at, created_at"
      )
      .eq("conversation_id", conversationId),
  ]);

  if (membersError) {
    throw new Error(membersError.message);
  }

  if (existingError) {
    throw new Error(existingError.message);
  }

  const desiredMembers: TeamMemberRow[] = (members ?? []).flatMap((member) => {
    const profile = Array.isArray(member?.profiles) ? member.profiles[0] : null;
    if (!member?.profile_id || !member?.role || !profile?.id) {
      return [];
    }

    return [
      {
        profile_id: String(member.profile_id),
        role: String(member.role),
        profiles: [profile],
      },
    ];
  });
  const desiredProfileIds = new Set(desiredMembers.map((member) => member.profile_id));
  const existingRows = existing ?? [];
  const existingByProfileId = new Map(
    existingRows
      .filter((row) => row.participant_type === "profile" && row.participant_profile_id)
      .map((row) => [String(row.participant_profile_id), row] as const)
  );

  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; participant_role: string; display_name: string; email: string | null }> = [];

  for (const member of desiredMembers) {
    const displayName = getParticipantDisplayName(member);
    const existingParticipant = existingByProfileId.get(member.profile_id);

    if (!existingParticipant) {
      inserts.push({
        organization_id: organizationId,
        conversation_id: conversationId,
        participant_type: "profile",
        participant_profile_id: member.profile_id,
        participant_role: member.role,
        display_name: displayName,
        email: member.profiles?.[0]?.email || null,
        last_read_at: null,
      });
      continue;
    }

    if (
      existingParticipant.participant_role !== member.role ||
      (existingParticipant.display_name || "") !== displayName ||
      (existingParticipant.email || "") !== (member.profiles?.[0]?.email || "")
    ) {
      updates.push({
        id: existingParticipant.id,
        participant_role: member.role,
        display_name: displayName,
        email: member.profiles?.[0]?.email || null,
      });
    }
  }

  const removableIds = existingRows
    .filter((row) => {
      if (row.participant_type !== "profile") return true;
      if (!row.participant_profile_id) return true;
      return !desiredProfileIds.has(String(row.participant_profile_id));
    })
    .map((row) => row.id);

  if (inserts.length > 0) {
    const { error: insertError } = await service.from("chat_participants").insert(inserts);
    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  if (updates.length > 0) {
    for (const update of updates) {
      const { error: updateError } = await service
        .from("chat_participants")
        .update({
          participant_role: update.participant_role,
          display_name: update.display_name,
          email: update.email,
        })
        .eq("id", update.id);

      if (updateError) {
        throw new Error(updateError.message || "Could not update bulletin participants.");
      }
    }
  }

  if (removableIds.length > 0) {
    const { error: deleteError } = await service.from("chat_participants").delete().in("id", removableIds);
    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }
}
