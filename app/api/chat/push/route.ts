import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendChatPushForMessage } from "@/lib/server/chat-push-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
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

    const { data: message, error: messageError } = await service
      .from("chat_messages")
      .select("id,conversation_id")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError) {
      return NextResponse.json({ ok: false, error: messageError.message }, { status: 500 });
    }
    if (!message) {
      return NextResponse.json({ ok: false, error: "Message not found." }, { status: 404 });
    }

    const { data: participants, error: participantsError } = await service
      .from("chat_participants")
      .select("participant_profile_id,participant_owner_account_id")
      .eq("conversation_id", message.conversation_id);

    if (participantsError) {
      return NextResponse.json({ ok: false, error: participantsError.message }, { status: 500 });
    }

    const participantRows = participants || [];
    const senderIsParticipant = participantRows.some((participant: any) => participant.participant_profile_id === user.id);
    let canAccess = senderIsParticipant;

    if (!canAccess) {
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

        canAccess = (ownerRows || []).some((owner: any) => owner.profile_id === user.id);
      }
    }

    if (!canAccess) {
      return NextResponse.json({ ok: false, error: "You do not have access to this chat." }, { status: 403 });
    }

    const result = await sendChatPushForMessage(service, messageId, user.id);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send chat push.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
