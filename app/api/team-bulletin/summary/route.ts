import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ensureTeamBulletinConversation,
  pruneTeamBulletinMessages,
  syncTeamBulletinParticipants,
} from "@/lib/server/team-bulletin";

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

export async function GET(request: NextRequest) {
  try {
    if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
      return NextResponse.json({ ok: false, error: "Supabase environment is incomplete." }, { status: 500 });
    }

    const token = getBearerToken(request);
    const portal = request.nextUrl.searchParams.get("portal")?.trim() || "";
    const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim() || "";

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token." }, { status: 401 });
    }

    if (!organizationId) {
      return NextResponse.json({ ok: false, error: "Organization id is required." }, { status: 400 });
    }

    if (!["admin", "cleaner", "grounds"].includes(portal)) {
      return NextResponse.json({ ok: false, error: "Portal must be admin, cleaner, or grounds." }, { status: 400 });
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

    const [{ data: profile, error: profileError }, { data: membership, error: membershipError }] = await Promise.all([
      service.from("profiles").select("id, email, full_name, role").eq("id", user.id).maybeSingle(),
      service
        .from("organization_members")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("profile_id", user.id)
        .maybeSingle(),
    ]);

    if (profileError || !profile) {
      return NextResponse.json({ ok: false, error: profileError?.message || "Profile not found." }, { status: 500 });
    }

    if (membershipError || !membership) {
      return NextResponse.json({ ok: false, error: "You do not have access to this team bulletin board." }, { status: 403 });
    }

    const membershipRole = String(membership.role || "").trim().toLowerCase();
    const allowed =
      portal === "admin"
        ? membershipRole === "admin"
        : membershipRole === portal || membershipRole === "admin";

    if (!allowed) {
      return NextResponse.json({ ok: false, error: "You do not have access to this team bulletin board." }, { status: 403 });
    }

    const conversation = await ensureTeamBulletinConversation(service, organizationId, user.id);
    await syncTeamBulletinParticipants(service, organizationId, conversation.id);
    await pruneTeamBulletinMessages(service, conversation.id);

    const [{ data: participant, error: participantError }, { data: messages, error: messagesError }] = await Promise.all([
      service
        .from("chat_participants")
        .select("id, last_read_at")
        .eq("conversation_id", conversation.id)
        .eq("participant_profile_id", user.id)
        .maybeSingle(),
      service
        .from("chat_messages")
        .select("id, sender_profile_id, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true }),
    ]);

    if (participantError) {
      return NextResponse.json({ ok: false, error: participantError.message }, { status: 500 });
    }

    if (messagesError) {
      return NextResponse.json({ ok: false, error: messagesError.message }, { status: 500 });
    }

    const lastReadAt = participant?.last_read_at ? new Date(participant.last_read_at).getTime() : 0;
    const unreadCount = (messages ?? []).filter((message) => {
      if (message.sender_profile_id === user.id) return false;
      const createdAt = message.created_at ? new Date(message.created_at).getTime() : 0;
      return createdAt > lastReadAt;
    }).length;

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      organizationId,
      unreadCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the team bulletin summary.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
