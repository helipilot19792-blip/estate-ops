import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function missingEnvironmentResponse() {
  return NextResponse.json(
    { error: "Missing Supabase server environment variables." },
    { status: 500 }
  );
}

async function requireAdmin(request: NextRequest, organizationId: string) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return { response: missingEnvironmentResponse() };
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return { response: NextResponse.json({ error: "Missing auth token." }, { status: 401 }) };
  }

  const authClient = createClient(supabaseUrl, publicSupabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return { response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { response: NextResponse.json({ error: profileError.message }, { status: 500 }) };
  }

  if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
    return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }

  if (profile.role !== "platform_admin") {
    const { data: membership, error: membershipError } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (membershipError) {
      return { response: NextResponse.json({ error: membershipError.message }, { status: 500 }) };
    }

    if (!membership) {
      return {
        response: NextResponse.json(
          { error: "Admin access required for this organization." },
          { status: 403 }
        ),
      };
    }
  }

  return { user, serviceClient };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();
    const category = String(body?.category || "").trim();
    const urgency = String(body?.urgency || "normal").trim() || "normal";
    const notes = String(body?.notes || "").trim();

    if (!organizationId || !propertyId || !category || !notes) {
      return NextResponse.json({ error: "Missing required maintenance flag details." }, { status: 400 });
    }

    const admin = await requireAdmin(request, organizationId);
    if ("response" in admin) return admin.response;

    const { data: property, error: propertyError } = await admin.serviceClient
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 });
    }

    if (!property) {
      return NextResponse.json({ error: "Property not found for this organization." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const { data: flag, error } = await admin.serviceClient
      .from("property_maintenance_flags")
      .insert({
        organization_id: organizationId,
        property_id: propertyId,
        source: "admin",
        category,
        urgency,
        status: "open",
        notes,
        flagged_by_profile_id: admin.user.id,
        flagged_at: nowIso,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, flag });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create maintenance flag." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const flagId = String(body?.flagId || "").trim();

    if (!organizationId || !flagId) {
      return NextResponse.json({ error: "Missing maintenance flag." }, { status: 400 });
    }

    const admin = await requireAdmin(request, organizationId);
    if ("response" in admin) return admin.response;

    const { data: flag, error } = await admin.serviceClient
      .from("property_maintenance_flags")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by_profile_id: admin.user.id,
      })
      .eq("id", flagId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, flag });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not resolve maintenance flag." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const flagIds = Array.isArray(body?.flagIds)
      ? body.flagIds.map((id: unknown) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!organizationId || flagIds.length === 0) {
      return NextResponse.json({ error: "Missing maintenance flags." }, { status: 400 });
    }

    const admin = await requireAdmin(request, organizationId);
    if ("response" in admin) return admin.response;

    const { error: imageError } = await admin.serviceClient
      .from("property_maintenance_flag_images")
      .delete()
      .in("flag_id", flagIds);

    if (imageError) {
      return NextResponse.json({ error: imageError.message }, { status: 500 });
    }

    const { error } = await admin.serviceClient
      .from("property_maintenance_flags")
      .delete()
      .eq("organization_id", organizationId)
      .in("id", flagIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deletedIds: flagIds });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete maintenance flags." },
      { status: 500 }
    );
  }
}
