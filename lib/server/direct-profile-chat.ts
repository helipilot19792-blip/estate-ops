import { type SupabaseClient } from "@supabase/supabase-js";
import { sendStaffPushNotifications } from "@/lib/server/staff-push-notifications";

type ServiceClient = SupabaseClient;

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

function trimBody(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= 110) return text;
  return `${text.slice(0, 107)}...`;
}

function getPortalForRole(role?: string | null) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "platform_admin") return "admin" as const;
  if (normalized === "cleaner") return "cleaner" as const;
  if (normalized === "grounds") return "grounds" as const;
  return null;
}

async function loadProfile(service: ServiceClient, profileId: string) {
  const { data, error } = await service
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("id", profileId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Profile not found.");
  return data as ProfileRow;
}

async function findExistingConversation(
  service: ServiceClient,
  organizationId: string,
  targetProfileId: string
) {
  const { data: participantRows, error: participantError } = await service
    .from("chat_participants")
    .select("conversation_id")
    .eq("organization_id", organizationId)
    .eq("participant_type", "profile")
    .eq("participant_profile_id", targetProfileId);

  if (participantError) throw new Error(participantError.message);

  const conversationIds = Array.from(
    new Set((participantRows ?? []).map((row) => String(row.conversation_id || "")).filter(Boolean))
  );

  if (conversationIds.length === 0) return null;

  const { data: conversations, error: conversationError } = await service
    .from("chat_conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("context_type", "direct")
    .in("id", conversationIds)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (conversationError) throw new Error(conversationError.message);
  return conversations?.[0]?.id ? String(conversations[0].id) : null;
}

export async function sendDirectProfileChatMessage(options: {
  service: ServiceClient;
  organizationId: string;
  senderProfileId: string;
  senderLabel?: string | null;
  subject: string;
  body: string;
  targetProfileId: string;
}) {
  const service = options.service;
  const targetProfile = await loadProfile(service, options.targetProfileId);
  const targetPortal = getPortalForRole(targetProfile.role);

  if (!targetPortal) {
    throw new Error("Only admin, cleaner, or grounds team members can receive a direct chat follow-up.");
  }

  const { data: adminMembers, error: adminError } = await service
    .from("organization_members")
    .select("profile_id")
    .eq("organization_id", options.organizationId)
    .eq("role", "admin");

  if (adminError) throw new Error(adminError.message);

  const adminProfileIds = Array.from(
    new Set((adminMembers ?? []).map((member) => String(member.profile_id || "")).filter(Boolean))
  );

  if (!adminProfileIds.includes(options.senderProfileId)) {
    throw new Error("Admin access required to message this team member.");
  }

  let conversationId = await findExistingConversation(service, options.organizationId, options.targetProfileId);

  if (!conversationId) {
    const now = new Date().toISOString();
    const { data: conversation, error: conversationError } = await service
      .from("chat_conversations")
      .insert({
        organization_id: options.organizationId,
        subject: options.subject.trim() || `Operations follow-up for ${targetProfile.full_name || targetProfile.email || "team member"}`,
        context_type: "direct",
        created_by_profile_id: options.senderProfileId,
        last_message_at: now,
      })
      .select("id")
      .single();

    if (conversationError) throw new Error(conversationError.message);
    conversationId = String(conversation.id);

    const participantRows = Array.from(
      new Map(
        [...adminProfileIds, options.targetProfileId].map((profileId) => [
          profileId,
          {
            organization_id: options.organizationId,
            conversation_id: conversationId,
            participant_type: "profile",
            participant_profile_id: profileId,
            participant_role: profileId === options.targetProfileId ? targetProfile.role : "admin",
            display_name:
              profileId === options.targetProfileId
                ? targetProfile.full_name || targetProfile.email || "Team member"
                : null,
            email: profileId === options.targetProfileId ? targetProfile.email : null,
            last_read_at: profileId === options.senderProfileId ? now : null,
          },
        ])
      ).values()
    );

    const { error: participantError } = await service.from("chat_participants").insert(participantRows);
    if (participantError) throw new Error(participantError.message);
  }

  const { data: insertedMessage, error: messageError } = await service
    .from("chat_messages")
    .insert({
      organization_id: options.organizationId,
      conversation_id: conversationId,
      sender_profile_id: options.senderProfileId,
      body: options.body.trim(),
    })
    .select("id")
    .single();

  if (messageError) throw new Error(messageError.message);

  await sendStaffPushNotifications(targetPortal, [options.targetProfileId], {
    title: `Message from ${options.senderLabel || "Operations"}`,
    body: trimBody(options.body),
    url: `/${targetPortal}?open=chat&conversationId=${encodeURIComponent(conversationId)}`,
    tag: `chat-${conversationId}-${insertedMessage.id}`,
  });

  return {
    conversationId,
    messageId: String(insertedMessage.id),
    targetName: targetProfile.full_name || targetProfile.email || "Team member",
    targetPortal,
  };
}
