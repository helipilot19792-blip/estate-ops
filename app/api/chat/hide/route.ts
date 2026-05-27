import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

async function getSignedInUser(token: string) {
  const authClient = createClient(supabaseUrl, publicSupabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) {
    throw new Error("Not authenticated.");
  }

  return user;
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
    const messageId = body?.messageId ? String(body.messageId).trim() : null;

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "Conversation id is required." }, { status: 400 });
    }

    const user = await getSignedInUser(token);
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: conversation, error: conversationError } = await service
      .from("chat_conversations")
      .select("id, organization_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json({ ok: false, error: conversationError.message }, { status: 500 });
    }

    if (!conversation) {
      return NextResponse.json({ ok: false, error: "Conversation not found." }, { status: 404 });
    }

    if (messageId) {
      const { data: message, error: messageError } = await service
        .from("chat_messages")
        .select("id")
        .eq("id", messageId)
        .eq("conversation_id", conversation.id)
        .eq("organization_id", conversation.organization_id)
        .maybeSingle();

      if (messageError) {
        return NextResponse.json({ ok: false, error: messageError.message }, { status: 500 });
      }

      if (!message) {
        return NextResponse.json({ ok: false, error: "Message not found in this conversation." }, { status: 404 });
      }
    }

    const { data: profile } = await service
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    const { data: participantRows, error: participantError } = await service
      .from("chat_participants")
      .select("participant_profile_id, participant_owner_account_id")
      .eq("conversation_id", conversation.id);

    if (participantError) {
      return NextResponse.json({ ok: false, error: participantError.message }, { status: 500 });
    }

    const ownerAccountIds = (participantRows || [])
      .map((participant: any) => participant.participant_owner_account_id)
      .filter(Boolean);
    const { data: ownerRows, error: ownerError } = ownerAccountIds.length
      ? await service.from("owner_accounts").select("id, profile_id").in("id", ownerAccountIds)
      : { data: [], error: null };

    if (ownerError) {
      return NextResponse.json({ ok: false, error: ownerError.message }, { status: 500 });
    }

    const ownOwnerAccount = (ownerRows || []).find((owner: any) => owner.profile_id === user.id) || null;
    const isConversationParticipant = (participantRows || []).some((participant: any) => {
      return participant.participant_profile_id === user.id || participant.participant_owner_account_id === ownOwnerAccount?.id;
    });

    const { data: adminMembership } = await service
      .from("organization_members")
      .select("role")
      .eq("organization_id", conversation.organization_id)
      .eq("profile_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    const isOrgAdmin = profile?.role === "platform_admin" || !!adminMembership;

    if (!isConversationParticipant && !isOrgAdmin) {
      return NextResponse.json({ ok: false, error: "You do not have access to this chat." }, { status: 403 });
    }

    const hiddenPayload = {
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      message_id: messageId,
      hidden_by_profile_id: ownOwnerAccount ? null : user.id,
      hidden_by_owner_account_id: ownOwnerAccount ? ownOwnerAccount.id : null,
    };

    const { error: hideError } = await service.from("chat_hidden_items").insert(hiddenPayload);

    if (hideError && hideError.code !== "23505") {
      return NextResponse.json({ ok: false, error: hideError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not hide chat item.";
    const status = message.includes("authenticated") ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
