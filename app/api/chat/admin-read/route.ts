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
    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "Conversation id is required." }, { status: 400 });
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
      .select("id, organization_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json({ ok: false, error: conversationError.message }, { status: 500 });
    }

    if (!conversation) {
      return NextResponse.json({ ok: false, error: "Conversation not found." }, { status: 404 });
    }

    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id, email, full_name, role")
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

    if (profile.role !== "platform_admin" && !membership) {
      return NextResponse.json({ ok: false, error: "You do not have admin access to this chat." }, { status: 403 });
    }

    const readAt = new Date().toISOString();
    const { data: existingParticipant, error: existingError } = await service
      .from("chat_participants")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("participant_profile_id", user.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
    }

    const payload = {
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      participant_type: "profile",
      participant_profile_id: user.id,
      participant_role: "admin",
      display_name: profile.full_name || profile.email || "Admin",
      email: profile.email,
      last_read_at: readAt,
    };

    const result = existingParticipant
      ? await service
          .from("chat_participants")
          .update({
            participant_role: payload.participant_role,
            display_name: payload.display_name,
            email: payload.email,
            last_read_at: readAt,
          })
          .eq("id", existingParticipant.id)
          .select("id,organization_id,conversation_id,participant_type,participant_profile_id,participant_owner_account_id,participant_role,display_name,email,last_read_at,created_at")
          .single()
      : await service
          .from("chat_participants")
          .insert(payload)
          .select("id,organization_id,conversation_id,participant_type,participant_profile_id,participant_owner_account_id,participant_role,display_name,email,last_read_at,created_at")
          .single();

    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, participant: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not mark chat read.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
