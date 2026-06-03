import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizeOptionalTime(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function normalizeOptionalCoordinate(value: unknown, min: number, max: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return "";
  return parsed;
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase server environment variables." },
      { status: 500 }
    );
  }

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
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
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();

    if (!organizationId || !propertyId) {
      return NextResponse.json({ error: "Missing organization or property." }, { status: 400 });
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

    const updatePayload = {
      wifi_network: String(body?.wifiNetwork || "").trim() || null,
      wifi_password: String(body?.wifiPassword || "").trim() || null,
      garbage_day: String(body?.garbageDay || "").trim() || null,
      garbage_notes: String(body?.garbageNotes || "").trim() || null,
      garbage_pickup_weekday:
        body?.garbagePickupWeekday === "" || body?.garbagePickupWeekday === null || body?.garbagePickupWeekday === undefined
          ? null
          : Number(body.garbagePickupWeekday),
      garbage_rotation_anchor_date: String(body?.garbageRotationAnchorDate || "").trim() || null,
      garbage_week_a_label: String(body?.garbageWeekALabel || "").trim() || "Garbage + recycling",
      garbage_week_b_label: String(body?.garbageWeekBLabel || "").trim() || "Recycling only",
      latitude: normalizeOptionalCoordinate(body?.latitude, -90, 90),
      longitude: normalizeOptionalCoordinate(body?.longitude, -180, 180),
      default_checkin_time: normalizeOptionalTime(body?.defaultCheckinTime),
      default_checkout_time: normalizeOptionalTime(body?.defaultCheckoutTime),
    };

    if (updatePayload.default_checkin_time === "" || updatePayload.default_checkout_time === "") {
      return NextResponse.json({ error: "Property check-in/check-out times must use HH:mm format." }, { status: 400 });
    }

    if (updatePayload.latitude === "" || updatePayload.longitude === "") {
      return NextResponse.json({ error: "Property GPS coordinates must be valid latitude and longitude values." }, { status: 400 });
    }

    const { data: property, error: updateError } = await serviceClient
      .from("properties")
      .update(updatePayload)
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, property });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save property details." },
      { status: 500 }
    );
  }
}
