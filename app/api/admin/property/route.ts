import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function verifyAdmin(serviceClient: any, userId: string, organizationId: string) {
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw profileError;

  if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
    return false;
  }

  if (profile.role === "platform_admin") {
    return true;
  }

  const { data: membership, error: membershipError } = await serviceClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (membershipError) throw membershipError;
  return !!membership;
}

async function linkOwnerToProperty(
  serviceClient: any,
  organizationId: string,
  propertyId: string,
  ownerEmailRaw: string,
  ownerNameRaw: string
) {
  const ownerEmail = ownerEmailRaw.trim().toLowerCase();
  const ownerName = ownerNameRaw.trim();

  if (!ownerEmail) return null;

  const { data: existingOwner, error: existingOwnerError } = await serviceClient
    .from("owner_accounts")
    .select("id, full_name")
    .eq("organization_id", organizationId)
    .ilike("email", ownerEmail)
    .limit(1)
    .maybeSingle();

  if (existingOwnerError) throw existingOwnerError;

  let ownerAccountId = existingOwner?.id || null;

  if (existingOwner) {
    if (ownerName && !existingOwner.full_name) {
      const { error: ownerUpdateError } = await serviceClient
        .from("owner_accounts")
        .update({ full_name: ownerName })
        .eq("id", existingOwner.id);

      if (ownerUpdateError) throw ownerUpdateError;
    }
  } else {
    const { data: insertedOwner, error: ownerInsertError } = await serviceClient
      .from("owner_accounts")
      .insert({
        organization_id: organizationId,
        email: ownerEmail,
        full_name: ownerName || null,
        is_active: true,
      })
      .select("id")
      .single();

    if (ownerInsertError || !insertedOwner) {
      throw ownerInsertError || new Error("Could not create owner account.");
    }

    ownerAccountId = insertedOwner.id;
  }

  if (!ownerAccountId) return null;

  const { data: existingAccess, error: existingAccessError } = await serviceClient
    .from("owner_property_access")
    .select("id")
    .eq("owner_account_id", ownerAccountId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (existingAccessError) throw existingAccessError;

  if (!existingAccess) {
    const { error: accessError } = await serviceClient.from("owner_property_access").insert({
      owner_account_id: ownerAccountId,
      property_id: propertyId,
    });

    if (accessError) throw accessError;
  }

  return ownerAccountId;
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
    const name = String(body?.name || "").trim();

    if (!organizationId || !name) {
      return NextResponse.json({ error: "Missing organization or property name." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const hasAdminAccess = await verifyAdmin(serviceClient, user.id, organizationId);
    if (!hasAdminAccess) {
      return NextResponse.json({ error: "Admin access required for this organization." }, { status: 403 });
    }

    const defaultCleanerUnits = Number(body?.defaultCleanerUnitsNeeded || 1);

    const propertyPayload = {
      organization_id: organizationId,
      name,
      address: String(body?.address || "").trim() || null,
      notes: String(body?.notes || "").trim() || null,
      cover_photo_url: String(body?.coverPhotoUrl || "").trim() || null,
      wifi_network: String(body?.wifiNetwork || "").trim() || null,
      wifi_password: String(body?.wifiPassword || "").trim() || null,
      garbage_day: String(body?.garbageDay || "").trim() || null,
      garbage_notes: String(body?.garbageNotes || "").trim() || null,
      garbage_pickup_weekday:
        body?.garbagePickupWeekday === "" ||
        body?.garbagePickupWeekday === null ||
        body?.garbagePickupWeekday === undefined
          ? null
          : Number(body.garbagePickupWeekday),
      garbage_rotation_anchor_date: String(body?.garbageRotationAnchorDate || "").trim() || null,
      garbage_week_a_label: String(body?.garbageWeekALabel || "").trim() || "Garbage + recycling",
      garbage_week_b_label: String(body?.garbageWeekBLabel || "").trim() || "Recycling only",
      default_cleaner_units_needed:
        Number.isFinite(defaultCleanerUnits) && defaultCleanerUnits > 0
          ? defaultCleanerUnits
          : 1,
      cleaner_units_required_strict: !!body?.cleanerUnitsRequiredStrict,
      show_team_status_to_cleaners: body?.showTeamStatusToCleaners !== false,
    };

    const { data: property, error: propertyError } = await serviceClient
      .from("properties")
      .insert(propertyPayload)
      .select("*")
      .single();

    if (propertyError || !property) {
      return NextResponse.json(
        { error: propertyError?.message || "Could not create property." },
        { status: 500 }
      );
    }

    const ownerAccountId = await linkOwnerToProperty(
      serviceClient,
      organizationId,
      property.id,
      String(body?.ownerEmail || ""),
      String(body?.ownerName || "")
    );

    let calendar = null;
    const calendarUrl = String(body?.calendarUrl || "").trim();
    const calendarSource = String(body?.calendarSource || "airbnb").trim() || "airbnb";

    if (calendarUrl) {
      const { data: insertedCalendar, error: calendarError } = await serviceClient
        .from("property_calendars")
        .insert({
          property_id: property.id,
          source: calendarSource,
          ical_url: calendarUrl,
          is_active: true,
        })
        .select("*")
        .single();

      if (calendarError) {
        return NextResponse.json(
          {
            error: `Property created, but the calendar could not be attached: ${calendarError.message}`,
            property,
            ownerAccountId,
          },
          { status: 500 }
        );
      }

      calendar = insertedCalendar;
    }

    return NextResponse.json({ ok: true, property, ownerAccountId, calendar });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create property." },
      { status: 500 }
    );
  }
}
