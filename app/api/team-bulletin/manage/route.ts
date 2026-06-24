import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  deleteTeamBulletinMessages,
  ensureTeamBulletinConversation,
  pruneTeamBulletinMessages,
  TEAM_BULLETIN_SUBJECT,
} from "@/lib/server/team-bulletin";
import { TEAM_BULLETIN_RETENTION_DAYS } from "@/lib/team-bulletin";

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
    const organizationId = String(body?.organizationId || "").trim();
    const action = String(body?.action || "").trim();
    const messageIds = Array.isArray(body?.messageIds)
      ? body.messageIds.map((value: unknown) => String(value || "").trim()).filter(Boolean)
      : [];

    if (!organizationId) {
      return NextResponse.json({ ok: false, error: "Organization id is required." }, { status: 400 });
    }

    if (!["delete-message", "clear-board", "prune-old"].includes(action)) {
      return NextResponse.json({ ok: false, error: "Unsupported bulletin action." }, { status: 400 });
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

    const { data: membership, error: membershipError } = await service
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (membershipError || membership?.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Admin access is required." }, { status: 403 });
    }

    const conversation = await ensureTeamBulletinConversation(service, organizationId, user.id);
    let removedCount = 0;

    if (action === "delete-message") {
      if (messageIds.length === 0) {
        return NextResponse.json({ ok: false, error: "Choose a bulletin message to delete." }, { status: 400 });
      }
      removedCount = await deleteTeamBulletinMessages(service, conversation.id, { messageIds });
    }

    if (action === "clear-board") {
      await deleteTeamBulletinMessages(service, conversation.id, { clearAll: true });
      removedCount = -1;
    }

    if (action === "prune-old") {
      removedCount = await pruneTeamBulletinMessages(service, conversation.id, TEAM_BULLETIN_RETENTION_DAYS);
    }

    return NextResponse.json({
      ok: true,
      action,
      conversationId: conversation.id,
      removedCount,
      retentionDays: TEAM_BULLETIN_RETENTION_DAYS,
      title: TEAM_BULLETIN_SUBJECT,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not manage the team bulletin board.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
