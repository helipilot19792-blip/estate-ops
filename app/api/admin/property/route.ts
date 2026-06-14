import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { geocodePropertyAddress } from "@/lib/server/property-geocoding";

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

async function assertOrganizationCanAddProperty(serviceClient: any, organizationId: string) {
  let organizationResult = await serviceClient
    .from("organizations")
    .select("id,subscription_status,trial_ends_at,account_type,property_limit")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationResult.error?.code === "42703") {
    organizationResult = await serviceClient
      .from("organizations")
      .select("id,subscription_status,trial_ends_at")
      .eq("id", organizationId)
      .maybeSingle();
  }

  if (organizationResult.error) throw organizationResult.error;
  if (!organizationResult.data) throw new Error("Organization not found.");

  const organization = organizationResult.data as {
    subscription_status?: string | null;
    trial_ends_at?: string | null;
    account_type?: string | null;
    property_limit?: number | null;
  };
  const status = String(organization.subscription_status || "trialing").toLowerCase();
  const accountType = String(organization.account_type || "beta").toLowerCase();

  if (status === "suspended" || status === "canceled") {
    throw new Error("This workspace is not active. Contact support to add more properties.");
  }

  if (accountType !== "internal" && status === "trialing" && organization.trial_ends_at) {
    const trialEndsAt = new Date(organization.trial_ends_at);
    if (!Number.isNaN(trialEndsAt.getTime()) && trialEndsAt.getTime() < Date.now()) {
      throw new Error("This workspace trial has ended. Contact support to add more properties.");
    }
  }

  if (accountType === "internal" || organization.property_limit === null || organization.property_limit === undefined) {
    return;
  }

  const { count, error } = await serviceClient
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (error) throw error;

  if ((count ?? 0) >= organization.property_limit) {
    throw new Error(`This workspace is at its ${organization.property_limit}-property plan limit.`);
  }
}

function normalizeOptionalCoordinate(value: unknown, min: number, max: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return "";
  return parsed;
}

async function loadIdsByColumn(serviceClient: any, table: string, column: string, value: string) {
  const { data, error } = await serviceClient
    .from(table)
    .select("id")
    .eq(column, value);

  if (error) {
    if (error.code === "42P01" || error.code === "42703") return [];
    throw new Error(`${table}: ${error.message}`);
  }

  return (data ?? []).map((row: { id: string }) => row.id).filter(Boolean);
}

async function deleteRowsByColumn(serviceClient: any, table: string, column: string, value: string) {
  const { count, error } = await serviceClient
    .from(table)
    .delete({ count: "exact" })
    .eq(column, value);

  if (error) {
    if (error.code === "42P01" || error.code === "42703") return 0;
    throw new Error(`${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function deleteRowsByIds(serviceClient: any, table: string, column: string, ids: string[]) {
  if (ids.length === 0) return 0;

  const { count, error } = await serviceClient
    .from(table)
    .delete({ count: "exact" })
    .in(column, ids);

  if (error) {
    if (error.code === "42P01" || error.code === "42703") return 0;
    throw new Error(`${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function clearDocumentPropertyLinks(serviceClient: any, propertyId: string) {
  const { count, error } = await serviceClient
    .from("document_vault_files")
    .update({ property_id: null }, { count: "exact" })
    .eq("property_id", propertyId);

  if (error) {
    if (error.code === "42P01" || error.code === "42703") return 0;
    throw new Error(`document_vault_files: ${error.message}`);
  }

  return count ?? 0;
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

    await assertOrganizationCanAddProperty(serviceClient, organizationId);

    const defaultCleanerUnits = Number(body?.defaultCleanerUnitsNeeded || 1);
    const latitude = normalizeOptionalCoordinate(body?.latitude, -90, 90);
    const longitude = normalizeOptionalCoordinate(body?.longitude, -180, 180);

    if (latitude === "" || longitude === "") {
      return NextResponse.json(
        { error: "Property GPS coordinates must be valid latitude and longitude values." },
        { status: 400 }
      );
    }

    const propertyPayload: Record<string, unknown> = {
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

    let geocodeWarning: string | null = null;

    if (latitude !== null) propertyPayload.latitude = latitude;
    if (longitude !== null) propertyPayload.longitude = longitude;

    if (latitude === null && longitude === null && propertyPayload.address) {
      try {
        const geocoded = await geocodePropertyAddress(String(propertyPayload.address));
        if (geocoded) {
          propertyPayload.latitude = geocoded.latitude;
          propertyPayload.longitude = geocoded.longitude;
        } else {
          geocodeWarning = "The address was saved, but GPS coordinates could not be found automatically.";
        }
      } catch {
        geocodeWarning = "The address was saved, but automatic GPS lookup did not complete.";
      }
    }

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

    return NextResponse.json({ ok: true, property, ownerAccountId, calendar, geocodeWarning });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create property." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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

    const hasAdminAccess = await verifyAdmin(serviceClient, user.id, organizationId);
    if (!hasAdminAccess) {
      return NextResponse.json({ error: "Admin access required for this organization." }, { status: 403 });
    }

    const { data: property, error: propertyError } = await serviceClient
      .from("properties")
      .select("id, name, address")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (propertyError) throw propertyError;
    if (!property) {
      return NextResponse.json({ error: "Property not found in this organization." }, { status: 404 });
    }

    const turnoverJobIds = await loadIdsByColumn(serviceClient, "turnover_jobs", "property_id", propertyId);
    const groundsJobIds = await loadIdsByColumn(serviceClient, "grounds_jobs", "property_id", propertyId);
    const sopIds = await loadIdsByColumn(serviceClient, "property_sops", "property_id", propertyId);
    const maintenanceFlagIds = await loadIdsByColumn(serviceClient, "property_maintenance_flags", "property_id", propertyId);
    const summary: Record<string, number> = {};
    let deletedRows = 0;

    const track = async (key: string, action: Promise<number>) => {
      const count = await action;
      summary[key] = count;
      deletedRows += count;
    };

    await track("document_vault_files_unlinked", clearDocumentPropertyLinks(serviceClient, propertyId));
    await track("property_maintenance_flag_images", deleteRowsByIds(serviceClient, "property_maintenance_flag_images", "flag_id", maintenanceFlagIds));
    await track("property_maintenance_flags", deleteRowsByColumn(serviceClient, "property_maintenance_flags", "property_id", propertyId));
    await track("property_inspection_photos", deleteRowsByColumn(serviceClient, "property_inspection_photos", "property_id", propertyId));
    await track("property_inspection_logs", deleteRowsByColumn(serviceClient, "property_inspection_logs", "property_id", propertyId));
    await track("property_inspection_rules", deleteRowsByColumn(serviceClient, "property_inspection_rules", "property_id", propertyId));
    await track("property_calendars", deleteRowsByColumn(serviceClient, "property_calendars", "property_id", propertyId));
    await track("property_booking_events", deleteRowsByColumn(serviceClient, "property_booking_events", "property_id", propertyId));
    await track("turnover_job_slots", deleteRowsByIds(serviceClient, "turnover_job_slots", "job_id", turnoverJobIds));
    await track("grounds_job_slots", deleteRowsByIds(serviceClient, "grounds_job_slots", "job_id", groundsJobIds));
    await track("turnover_jobs", deleteRowsByColumn(serviceClient, "turnover_jobs", "property_id", propertyId));
    await track("grounds_jobs", deleteRowsByColumn(serviceClient, "grounds_jobs", "property_id", propertyId));
    await track("property_access", deleteRowsByColumn(serviceClient, "property_access", "property_id", propertyId));
    await track("property_cleaner_account_assignments", deleteRowsByColumn(serviceClient, "property_cleaner_account_assignments", "property_id", propertyId));
    await track("property_grounds_account_assignments", deleteRowsByColumn(serviceClient, "property_grounds_account_assignments", "property_id", propertyId));
    await track("property_grounds_recurring_tasks", deleteRowsByColumn(serviceClient, "property_grounds_recurring_tasks", "property_id", propertyId));
    await track("property_grounds_recurring_rules", deleteRowsByColumn(serviceClient, "property_grounds_recurring_rules", "property_id", propertyId));
    await track("property_sop_images", deleteRowsByIds(serviceClient, "property_sop_images", "sop_id", sopIds));
    await track("property_sops", deleteRowsByColumn(serviceClient, "property_sops", "property_id", propertyId));
    await track("owner_property_access", deleteRowsByColumn(serviceClient, "owner_property_access", "property_id", propertyId));
    await track("property_invoice_rates", deleteRowsByColumn(serviceClient, "property_invoice_rates", "property_id", propertyId));

    const { count: propertyDeleteCount, error: propertyDeleteError } = await serviceClient
      .from("properties")
      .delete({ count: "exact" })
      .eq("id", propertyId)
      .eq("organization_id", organizationId);

    if (propertyDeleteError) throw propertyDeleteError;

    if ((propertyDeleteCount ?? 0) === 0) {
      return NextResponse.json({ error: "Property delete was blocked or already completed." }, { status: 409 });
    }

    summary.properties = propertyDeleteCount ?? 0;
    deletedRows += propertyDeleteCount ?? 0;

    return NextResponse.json({
      ok: true,
      message: `Property deleted: ${property.name || property.address || "property"}`,
      deletedRows,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete property." },
      { status: 500 }
    );
  }
}
