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

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMessage(value?: string | null) {
  return String(value || "").trim();
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
    const ownerAccountId = String(body?.ownerAccountId || "").trim();
    const message = normalizeMessage(body?.message);
    const subject = normalizeMessage(body?.subject);

    if (!ownerAccountId) {
      return NextResponse.json({ ok: false, error: "Owner account is required." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
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

    const { data: owner, error: ownerError } = await service
      .from("owner_accounts")
      .select("id,organization_id,email,full_name,profile_id,is_active")
      .eq("id", ownerAccountId)
      .maybeSingle();

    if (ownerError) {
      return NextResponse.json({ ok: false, error: ownerError.message }, { status: 500 });
    }

    if (!owner || owner.is_active === false) {
      return NextResponse.json({ ok: false, error: "Owner account not found." }, { status: 404 });
    }

    const ownerEmail = normalizeEmail(owner.email);
    const userEmail = normalizeEmail(user.email);
    const isLinkedOwner = owner.profile_id === user.id || (!!ownerEmail && ownerEmail === userEmail);

    if (!isLinkedOwner) {
      return NextResponse.json({ ok: false, error: "You do not have access to this owner chat." }, { status: 403 });
    }

    const { data: adminMembers, error: adminMembersError } = await service
      .from("organization_members")
      .select("profile_id")
      .eq("organization_id", owner.organization_id)
      .eq("role", "admin");

    if (adminMembersError) {
      return NextResponse.json({ ok: false, error: adminMembersError.message }, { status: 500 });
    }

    const adminProfileIds = Array.from(
      new Set((adminMembers || []).map((member: any) => member.profile_id).filter(Boolean))
    );

    const { data: adminProfiles, error: adminProfilesError } = adminProfileIds.length
      ? await service
          .from("profiles")
          .select("id,email,full_name,role")
          .in("id", adminProfileIds)
      : { data: [], error: null };

    if (adminProfilesError) {
      return NextResponse.json({ ok: false, error: adminProfilesError.message }, { status: 500 });
    }

    const now = new Date().toISOString();
    const { data: conversation, error: conversationError } = await service
      .from("chat_conversations")
      .insert({
        organization_id: owner.organization_id,
        subject: subject || `Message from ${owner.full_name || owner.email || "Owner"}`,
        context_type: "direct",
        created_by_profile_id: user.id,
        last_message_at: now,
      })
      .select("id,organization_id")
      .single();

    if (conversationError) {
      return NextResponse.json({ ok: false, error: conversationError.message }, { status: 500 });
    }

    const participants = [
      {
        organization_id: owner.organization_id,
        conversation_id: conversation.id,
        participant_type: "owner",
        participant_owner_account_id: owner.id,
        participant_role: "owner",
        display_name: owner.full_name || owner.email || "Owner",
        email: owner.email,
        last_read_at: now,
      },
      ...(adminProfiles || []).map((profile: any) => ({
        organization_id: owner.organization_id,
        conversation_id: conversation.id,
        participant_type: "profile",
        participant_profile_id: profile.id,
        participant_role: "admin",
        display_name: profile.full_name || profile.email || "Admin",
        email: profile.email,
        last_read_at: null,
      })),
    ];

    const { error: participantsError } = await service.from("chat_participants").insert(participants);
    if (participantsError) {
      return NextResponse.json({ ok: false, error: participantsError.message }, { status: 500 });
    }

    const { data: insertedMessage, error: messageError } = await service
      .from("chat_messages")
      .insert({
        organization_id: owner.organization_id,
        conversation_id: conversation.id,
        sender_profile_id: user.id,
        body: message,
      })
      .select("id")
      .single();

    if (messageError) {
      return NextResponse.json({ ok: false, error: messageError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      messageId: insertedMessage?.id || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start owner chat.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
