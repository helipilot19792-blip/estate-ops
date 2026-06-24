import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendStaffPushNotifications } from "@/lib/server/staff-push-notifications";
import { TEAM_BULLETIN_CONTEXT_TYPE } from "@/lib/team-bulletin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type PushPortal = "admin" | "cleaner" | "grounds" | "owner";

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

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

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
      return NextResponse.json({ ok: false, error: "Supabase environment is incomplete." }, { status: 500 });
    }

    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const messageId = String(body?.messageId || "").trim();
    if (!messageId) {
      return NextResponse.json({ ok: false, error: "Message id is required." }, { status: 400 });
    }

    const authClient = createClient(supabaseUrl, publicSupabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }
    const userId = user.id;

    const { data: message, error: messageError } = await service
      .from("chat_messages")
      .select("id,organization_id,conversation_id,sender_profile_id,body,created_at")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError) {
      return NextResponse.json({ ok: false, error: messageError.message }, { status: 500 });
    }

    if (!message) {
      return NextResponse.json({ ok: false, error: "Message not found." }, { status: 404 });
    }

    const { data: conversation, error: conversationError } = await service
      .from("chat_conversations")
      .select("id,context_type")
      .eq("id", message.conversation_id)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json({ ok: false, error: conversationError.message }, { status: 500 });
    }

    const isTeamBulletin = conversation?.context_type === TEAM_BULLETIN_CONTEXT_TYPE;

    const { data: participants, error: participantsError } = await service
      .from("chat_participants")
      .select("id,conversation_id,participant_type,participant_profile_id,participant_owner_account_id,participant_role,display_name,email")
      .eq("conversation_id", message.conversation_id);

    if (participantsError) {
      return NextResponse.json({ ok: false, error: participantsError.message }, { status: 500 });
    }

    const participantRows = participants || [];
    const senderIsParticipant = participantRows.some((participant: any) => {
      if (participant.participant_profile_id === userId) return true;
      return false;
    });

    if (!senderIsParticipant) {
      const ownerParticipantIds = participantRows
        .map((participant: any) => participant.participant_owner_account_id)
        .filter(Boolean);

      if (ownerParticipantIds.length > 0) {
        const { data: ownerRows, error: ownerError } = await service
          .from("owner_accounts")
          .select("id,profile_id")
          .in("id", ownerParticipantIds);

        if (ownerError) {
          return NextResponse.json({ ok: false, error: ownerError.message }, { status: 500 });
        }

        const ownerMatch = (ownerRows || []).some((owner: any) => owner.profile_id === userId);
        if (!ownerMatch) {
          return NextResponse.json({ ok: false, error: "You do not have access to this chat." }, { status: 403 });
        }
      } else {
        return NextResponse.json({ ok: false, error: "You do not have access to this chat." }, { status: 403 });
      }
    }

    const { error: unhideError } = await service
      .from("chat_hidden_items")
      .delete()
      .eq("conversation_id", message.conversation_id)
      .is("message_id", null);

    if (unhideError) {
      return NextResponse.json(
        { ok: false, error: `Message sent, but the conversation could not be restored: ${unhideError.message}` },
        { status: 500 }
      );
    }

    const ownerIdsToNotify = participantRows
      .filter((participant: any) => participant.participant_type === "owner")
      .map((participant: any) => participant.participant_owner_account_id)
      .filter(Boolean);
    const { data: ownerRows, error: ownerError } =
      ownerIdsToNotify.length > 0
        ? await service.from("owner_accounts").select("id,profile_id").in("id", ownerIdsToNotify)
        : { data: [], error: null };

    if (ownerError) {
      return NextResponse.json({ ok: false, error: ownerError.message }, { status: 500 });
    }

    const ownerProfileById = new Map((ownerRows || []).map((owner: any) => [owner.id, owner.profile_id]));
    const recipientsByPortal = new Map<PushPortal, Set<string>>();
    let recipientCount = 0;

    function addRecipient(portal: PushPortal, profileId?: string | null) {
      if (!profileId || profileId === userId) return;
      if (!recipientsByPortal.has(portal)) recipientsByPortal.set(portal, new Set());
      const recipients = recipientsByPortal.get(portal)!;
      if (!recipients.has(profileId)) recipientCount += 1;
      recipients.add(profileId);
    }

    const senderParticipant = participantRows.find((participant: any) => {
      if (participant.participant_profile_id === userId) return true;
      const ownerProfileId = ownerProfileById.get(participant.participant_owner_account_id);
      return ownerProfileId === userId;
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

      if (adminMembersError) {
        return NextResponse.json({ ok: false, error: adminMembersError.message }, { status: 500 });
      }

      for (const member of adminMembers || []) {
        addRecipient("admin", member.profile_id);
      }
    }

    for (const participant of participantRows as any[]) {
      if (participant.participant_type === "owner") {
        if (isTeamBulletin) continue;
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
    const chatTargetByPortal = {
      owner: `/owner?tab=chat&conversationId=${encodeURIComponent(message.conversation_id)}`,
      admin: `/admin?open=${isTeamBulletin ? "bulletin" : "chat"}&conversationId=${encodeURIComponent(message.conversation_id)}`,
      cleaner: `/cleaner?open=${isTeamBulletin ? "bulletin" : "chat"}&conversationId=${encodeURIComponent(message.conversation_id)}`,
      grounds: `/grounds?open=${isTeamBulletin ? "bulletin" : "chat"}&conversationId=${encodeURIComponent(message.conversation_id)}`,
    } satisfies Record<PushPortal, string>;

    for (const [portal, profileIds] of recipientsByPortal.entries()) {
      const result = await sendStaffPushNotifications(portal, [...profileIds], {
        title: `${isTeamBulletin ? "New bulletin post" : "New chat"} from ${senderLabel}`,
        body: summary || `Open Gulera OS to read the ${isTeamBulletin ? "bulletin post" : "message"}.`,
        url: chatTargetByPortal[portal],
        tag: `${isTeamBulletin ? "bulletin" : "chat"}-${message.conversation_id}-${message.id}`,
      });

      sent += result.sent;
      errors.push(...result.errors);
      deliveries.push(...(result.deliveries || []));
    }

    console.info(
      "chat push delivery",
      JSON.stringify({
        messageId: message.id,
        conversationId: message.conversation_id,
        senderProfileId: message.sender_profile_id,
        recipientCount,
        sent,
        errors,
        deliveries,
      })
    );

    if (recipientCount > 0 && sent === 0 && errors.length > 0) {
      return NextResponse.json({ ok: false, sent, recipientCount, errors, deliveries }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sent, recipientCount, errors, deliveries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send chat push.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
