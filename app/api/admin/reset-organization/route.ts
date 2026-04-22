import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { ok: false, error: "Missing authorization header." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return Response.json(
        { ok: false, error: "Missing access token." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const organizationId =
      typeof body?.organizationId === "string" ? body.organizationId.trim() : "";

    if (!organizationId) {
      return Response.json(
        { ok: false, error: "Missing organizationId." },
        { status: 400 }
      );
    }

    // 🔐 Verify user from token
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json(
        { ok: false, error: "Invalid user." },
        { status: 401 }
      );
    }

    // 🔐 Verify membership + role
    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return Response.json(
        { ok: false, error: "You do not have access to this organization." },
        { status: 403 }
      );
    }

    if (membership.role !== "admin") {
      return Response.json(
        { ok: false, error: "Only admins can reset organization data." },
        { status: 403 }
      );
    }

    // ✅ SAFE — no deletes yet
    return Response.json({
      ok: true,
      message: "Safety checks passed. Ready for reset.",
      organizationId,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}