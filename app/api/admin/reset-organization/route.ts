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

    const { data: flags, error: flagsError } = await supabase
      .from("property_maintenance_flags")
      .select("id")
      .eq("organization_id", organizationId);

    if (flagsError) {
      throw flagsError;
    }

    const flagIds = (flags ?? []).map((flag) => flag.id);
    let deletedFlagImages = 0;

    if (flagIds.length > 0) {
      const { error: imageDeleteError, count } = await supabase
        .from("property_maintenance_flag_images")
        .delete({ count: "exact" })
        .in("flag_id", flagIds);

      if (imageDeleteError) {
        throw imageDeleteError;
      }

      deletedFlagImages = count ?? 0;
    }

    const { error: flagDeleteError, count: deletedFlags } = await supabase
      .from("property_maintenance_flags")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);

    if (flagDeleteError) {
      throw flagDeleteError;
    }

    return Response.json({
      ok: true,
      message: "Reset step completed.",
      deleted: {
        property_maintenance_flag_images: deletedFlagImages,
        property_maintenance_flags: deletedFlags ?? 0,
      },
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