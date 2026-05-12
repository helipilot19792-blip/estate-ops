import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function missingEnvResponse() {
  return NextResponse.json(
    { error: "Missing Supabase server environment variables." },
    { status: 500 }
  );
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return missingEnvResponse();
  }

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, publicSupabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();
    const doorCode = String(body?.doorCode || "").trim() || null;
    const alarmCode = String(body?.alarmCode || "").trim() || null;
    const notes = String(body?.notes || "").trim() || null;

    if (!organizationId) {
      return NextResponse.json({ error: "Missing organizationId." }, { status: 400 });
    }

    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId." }, { status: 400 });
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
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
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
        return NextResponse.json({ error: membershipError.message }, { status: 500 });
      }

      if (!membership) {
        return NextResponse.json({ error: "Admin access required for this organization." }, { status: 403 });
      }
    }

    const { data: property, error: propertyError } = await serviceClient
      .from("properties")
      .select("id, organization_id")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 });
    }

    if (!property) {
      return NextResponse.json({ error: "Property not found in this organization." }, { status: 404 });
    }

    const { data: existing, error: existingError } = await serviceClient
      .from("property_access")
      .select("id")
      .eq("property_id", propertyId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const payload = {
      property_id: propertyId,
      door_code: doorCode,
      alarm_code: alarmCode,
      notes,
    };

    const writeResult = existing
      ? await serviceClient
          .from("property_access")
          .update(payload)
          .eq("id", existing.id)
          .select("*")
          .single()
      : await serviceClient
          .from("property_access")
          .insert(payload)
          .select("*")
          .single();

    if (writeResult.error) {
      return NextResponse.json({ error: writeResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, access: writeResult.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save property access." },
      { status: 500 }
    );
  }
}
