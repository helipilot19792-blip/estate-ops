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
    const conversationId = String(body?.conversationId || "").trim();
    const messageBody = String(body?.body || "").trim();
    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "Conversation id is required." }, { status: 400 });
    }
    if (!messageBody) {
      return NextResponse.json({ ok: false, error: "Message body is required." }, { status: 400 });
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

    const { data: conversation, error: conversationError } = await service
      .from("chat_conversations")
      .select("id,organization_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json({ ok: false, error: conversationError.message }, { status: 500 });
    }
    if (!conversation) {
      return NextResponse.json({ ok: false, error: "Conversation not found." }, { status: 404 });
    }

    const { data: participants, error: participantsError } = await service
      .from("chat_participants")
      .select("id,participant_type,participant_profile_id,participant_owner_account_id,participant_role")
      .eq("conversation_id", conversation.id);

    if (participantsError) {
      return NextResponse.json({ ok: false, error: participantsError.message }, { status: 500 });
    }

    const participantRows = participants || [];
    const profileParticipant = participantRows.find((participant: any) => participant.participant_profile_id === user.id);
    const ownerParticipantIds = participantRows
      .map((participant: any) => participant.participant_owner_account_id)
      .filter(Boolean);
    const { data: ownerRows, error: ownerError } =
      ownerParticipantIds.length > 0
        ? await service.from("owner_accounts").select("id,profile_id").in("id", ownerParticipantIds)
        : { data: [], error: null };

    if (ownerError) {
      return NextResponse.json({ ok: false, error: ownerError.message }, { status: 500 });
    }

    const ownerParticipant = (ownerRows || []).find((owner: any) => owner.profile_id === user.id);
    let canSend = !!profileParticipant || !!ownerParticipant;

    if (!canSend) {
      const { data: profile, error: profileError } = await service
        .from("profiles")
        .select("id,email,full_name,role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile) {
        return NextResponse.json({ ok: false, error: profileError?.message || "Profile not found." }, { status: 500 });
      }

      const { data: membership, error: membershipError } = await service
        .from("organization_members")
        .select("role")
        .eq("organization_id", conversation.organization_id)
        .eq("profile_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (membershipError) {
        return NextResponse.json({ ok: false, error: membershipError.message }, { status: 500 });
      }

      canSend = profile.role === "platform_admin" || !!membership;
      if (canSend) {
        const { error: insertParticipantError } = await service.from("chat_participants").insert({
          organization_id: conversation.organization_id,
          conversation_id: conversation.id,
          participant_type: "profile",
          participant_profile_id: user.id,
          participant_role: "admin",
          display_name: profile.full_name || profile.email || "Admin",
          email: profile.email,
          last_read_at: new Date().toISOString(),
        });

        if (insertParticipantError) {
          return NextResponse.json({ ok: false, error: insertParticipantError.message }, { status: 500 });
        }
      }
    }

    if (!canSend) {
      return NextResponse.json({ ok: false, error: "You do not have access to this chat." }, { status: 403 });
    }

    const { data: message, error: messageError } = await service
      .from("chat_messages")
      .insert({
        organization_id: conversation.organization_id,
        conversation_id: conversation.id,
        sender_profile_id: user.id,
        body: messageBody,
      })
      .select("id,organization_id,conversation_id,sender_profile_id,body,created_at,updated_at")
      .single();

    if (messageError) {
      return NextResponse.json({ ok: false, error: messageError.message }, { status: 500 });
    }

    const push = await sendChatPushForMessage(service, message.id, user.id);
    return NextResponse.json({ ok: true, message, push });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send chat message.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
