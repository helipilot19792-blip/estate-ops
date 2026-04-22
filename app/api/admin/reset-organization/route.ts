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

    // 🔐 Auth check
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

    // 🔐 Membership check
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

    // 🔍 Get properties
    const { data: properties, error: propertiesError } = await supabase
      .from("properties")
      .select("id")
      .eq("organization_id", organizationId);

    if (propertiesError) throw propertiesError;

    const propertyIds = (properties ?? []).map((p) => p.id);

    // 🔍 Get turnover jobs
    const { data: turnoverJobs, error: tjError } = await supabase
      .from("turnover_jobs")
      .select("id")
      .eq("organization_id", organizationId);

    if (tjError) throw tjError;

    const turnoverJobIds = (turnoverJobs ?? []).map((j) => j.id);

    // 🔍 Get grounds jobs
    const { data: groundsJobs, error: gjError } = await supabase
      .from("grounds_jobs")
      .select("id")
      .eq("organization_id", organizationId);

    if (gjError) throw gjError;

    const groundsJobIds = (groundsJobs ?? []).map((j) => j.id);

    // 🧹 Delete turnover job slots
    let deletedTurnoverSlots = 0;
    if (turnoverJobIds.length > 0) {
      const { error, count } = await supabase
        .from("turnover_job_slots")
        .delete({ count: "exact" })
        .in("job_id", turnoverJobIds);

      if (error) throw error;
      deletedTurnoverSlots = count ?? 0;
    }

    // 🧹 Delete grounds job slots
    let deletedGroundsSlots = 0;
    if (groundsJobIds.length > 0) {
      const { error, count } = await supabase
        .from("grounds_job_slots")
        .delete({ count: "exact" })
        .in("job_id", groundsJobIds);

      if (error) throw error;
      deletedGroundsSlots = count ?? 0;
    }

    // 🧹 Delete turnover jobs
    const { error: delTJError, count: deletedTurnoverJobs } = await supabase
      .from("turnover_jobs")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);

    if (delTJError) throw delTJError;

    // 🧹 Delete grounds jobs
    const { error: delGJError, count: deletedGroundsJobs } = await supabase
      .from("grounds_jobs")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);

    if (delGJError) throw delGJError;

    return Response.json({
      ok: true,
      message: "Reset step completed.",
      deleted: {
        turnover_job_slots: deletedTurnoverSlots,
        grounds_job_slots: deletedGroundsSlots,
        turnover_jobs: deletedTurnoverJobs ?? 0,
        grounds_jobs: deletedGroundsJobs ?? 0,
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