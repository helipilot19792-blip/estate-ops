import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function createAuthClient(token: string) {
  return createClient(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "";
}

async function requireAdminAccess(token: string, organizationId: string) {
  const authClient = createAuthClient(token);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated.");
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("No profile was found for this user.");
  }

  if (profile.role === "platform_admin") {
    return { user, profile };
  }

  const { data: membership, error: membershipError } = await serviceClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (membershipError || membership?.role !== "admin") {
    throw new Error("Admin access required for this organization.");
  }

  return { user, profile };
}

export async function PATCH(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing authorization header." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    const organizationId = typeof body?.organizationId === "string" ? body.organizationId.trim() : "";
    const status = typeof body?.status === "string" ? body.status.trim() : "";
    const adminNotes = typeof body?.adminNotes === "string" ? body.adminNotes.trim().slice(0, 2000) : "";
    const allowedStatuses = new Set(["pending", "reviewing", "completed", "denied", "cancelled"]);

    if (!requestId || !organizationId || !allowedStatuses.has(status)) {
      return NextResponse.json({ ok: false, error: "Missing account deletion request details." }, { status: 400 });
    }

    const { user } = await requireAdminAccess(token, organizationId);
    const now = new Date().toISOString();
    const update: Record<string, string | null> = {
      status,
      admin_notes: adminNotes || null,
      reviewed_at: now,
      reviewed_by_profile_id: user.id,
      completed_at: status === "completed" ? now : null,
    };

    const { data: deletionRequest, error: updateError } = await serviceClient
      .from("account_deletion_requests")
      .update(update)
      .eq("id", requestId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      request: deletionRequest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update account deletion request.";
    const status = message.includes("authenticated") || message.includes("access required") ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
