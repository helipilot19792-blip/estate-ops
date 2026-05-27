import type { SupabaseClient } from "@supabase/supabase-js";
import { sendStaffPushNotifications } from "@/lib/server/staff-push-notifications";

type PushPortal = "admin" | "cleaner" | "grounds" | "owner";

function getPortalForProfileParticipant(role?: string | null): PushPortal | null {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "platform_admin") return "admin";
  if (normalized === "cleaner") return "cleaner";
  if (normalized === "grounds") return "grounds";
  return null;
}

function trimBody(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 110) return text;
  return `${text.slice(0, 107)}...`;
}

export async function sendChatPushForMessage(
  service: SupabaseClient,
  messageId: string,
  actorUserId: string
) {
  const { data: message, error: messageError } = await service
    .from("chat_messages")
    .select("id,organization_id,conversation_id,sender_profile_id,body,created_at")
    .eq("id", messageId)
    .maybeSingle();

  if (messageError) throw new Error(messageError.message);
  if (!message) throw new Error("Message not found.");

  const { data: participants, error: participantsError } = await service
    .from("chat_participants")
    .select("id,conversation_id,participant_type,participant_profile_id,participant_owner_account_id,participant_role,display_name,email")
    .eq("conversation_id", message.conversation_id);

  if (participantsError) throw new Error(participantsError.message);

  const participantRows = participants || [];

  const { error: unhideError } = await service
    .from("chat_hidden_items")
    .delete()
    .eq("conversation_id", message.conversation_id)
    .is("message_id", null);

  if (unhideError) {
    throw new Error(`Message sent, but the conversation could not be restored: ${unhideError.message}`);
  }

  const ownerIdsToNotify = participantRows
    .filter((participant: any) => participant.participant_type === "owner")
    .map((participant: any) => participant.participant_owner_account_id)
    .filter(Boolean);
  const { data: ownerRows, error: ownerError } =
    ownerIdsToNotify.length > 0
      ? await service.from("owner_accounts").select("id,profile_id").in("id", ownerIdsToNotify)
      : { data: [], error: null };

  if (ownerError) throw new Error(ownerError.message);

  const ownerProfileById = new Map((ownerRows || []).map((owner: any) => [owner.id, owner.profile_id]));
  const recipientsByPortal = new Map<PushPortal, Set<string>>();
  let recipientCount = 0;

  function addRecipient(portal: PushPortal, profileId?: string | null) {
    if (!profileId || profileId === actorUserId) return;
    if (!recipientsByPortal.has(portal)) recipientsByPortal.set(portal, new Set());
    const recipients = recipientsByPortal.get(portal)!;
    if (!recipients.has(profileId)) recipientCount += 1;
    recipients.add(profileId);
  }

  const senderParticipant = participantRows.find((participant: any) => {
    if (participant.participant_profile_id === actorUserId) return true;
    const ownerProfileId = ownerProfileById.get(participant.participant_owner_account_id);
    return ownerProfileId === actorUserId;
  });
  const senderPortal =
    senderParticipant?.participant_type === "owner"
      ? "owner"
      : getPortalForProfileParticipant(senderParticipant?.participant_role);
  const hasAdminParticipant = participantRows.some(
    (participant: any) => getPortalForProfileParticipant(participant.participant_role) === "admin"
  );

  if (senderPortal !== "admin" && hasAdminParticipant) {
    const { data: adminMembers, error: adminMembersError } = await service
      .from("organization_members")
      .select("profile_id")
      .eq("organization_id", message.organization_id)
      .eq("role", "admin");

    if (adminMembersError) throw new Error(adminMembersError.message);

    for (const member of adminMembers || []) {
      addRecipient("admin", member.profile_id);
    }
  }

  for (const participant of participantRows as any[]) {
    if (participant.participant_type === "owner") {
      addRecipient("owner", ownerProfileById.get(participant.participant_owner_account_id));
      continue;
    }

    const portal = getPortalForProfileParticipant(participant.participant_role);
    if (portal) {
      addRecipient(portal, participant.participant_profile_id);
    }
  }

  let sent = 0;
  const errors: string[] = [];
  const deliveries: unknown[] = [];
  const senderLabel = senderParticipant?.display_name || senderParticipant?.email || "Gulera OS";
  const summary = trimBody(message.body);

  for (const [portal, profileIds] of recipientsByPortal.entries()) {
    const result = await sendStaffPushNotifications(portal, [...profileIds], {
      title: `New chat from ${senderLabel}`,
      body: summary || "Open Gulera OS to read the message.",
      url: portal === "owner" ? "/owner?tab=chat" : portal === "admin" ? "/admin?open=chat" : `/${portal}`,
      tag: `chat-${message.conversation_id}`,
    });

    sent += result.sent;
    errors.push(...result.errors);
    deliveries.push(...(result.deliveries || []));
  }

  return { ok: !(recipientCount > 0 && sent === 0 && errors.length > 0), sent, recipientCount, errors, deliveries };
}
