import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/server/audit-log";
import { applyCleanerTrainingRotationToJob } from "@/lib/server/cleaner-training-rotation";
import { sendJobOfferEmailsForSlots } from "@/lib/server/job-notifications";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function createAuthClient(token: string) {
  return createClient(supabaseUrl!, publicSupabaseKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(20, Math.max(1, Math.floor(parsed)));
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeDate(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
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

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, email, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
    throw new Error("Admin access required.");
  }

  if (profile.role !== "platform_admin") {
    const { data: membership, error: membershipError } = await service
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (membershipError) throw new Error(membershipError.message);
    if (membership?.role !== "admin") {
      throw new Error("Admin access required for this organization.");
    }
  }

  return { user, profile };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();
    const scheduledFor = normalizeDate(body?.scheduledFor);
    const notes = String(body?.notes || "").trim() || null;

    if (!organizationId || !propertyId || !scheduledFor) {
      return NextResponse.json(
        { error: "Missing organization, property, or cleaning date." },
        { status: 400 }
      );
    }

    const { user, profile } = await requireAdminAccess(token, organizationId);

    const { data: property, error: propertyError } = await service
      .from("properties")
      .select("id, organization_id")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (propertyError) throw new Error(propertyError.message);
    if (!property) {
      return NextResponse.json(
        { error: "Property was not found in this organization." },
        { status: 404 }
      );
    }

    const cleanersNeeded = normalizePositiveInteger(body?.cleanersNeeded, 1);
    const cleanerUnitsNeeded = normalizePositiveInteger(body?.cleanerUnitsNeeded, cleanersNeeded);
    const cleanersRequiredStrict = normalizeBoolean(body?.cleanersRequiredStrict, false);
    const cleanerUnitsRequiredStrict = normalizeBoolean(
      body?.cleanerUnitsRequiredStrict,
      cleanersRequiredStrict
    );
    const showTeamStatusToCleaners = normalizeBoolean(body?.showTeamStatusToCleaners, true);

    const { data: insertedJob, error: insertError } = await service
      .from("turnover_jobs")
      .insert({
        organization_id: organizationId,
        property_id: propertyId,
        cleaners_needed: cleanersNeeded,
        cleaners_required_strict: cleanersRequiredStrict,
        cleaner_units_needed: cleanerUnitsNeeded,
        cleaner_units_required_strict: cleanerUnitsRequiredStrict,
        show_team_status_to_cleaners: showTeamStatusToCleaners,
        notes,
        scheduled_for: scheduledFor,
      })
      .select("id")
      .single();

    if (insertError || !insertedJob) {
      throw new Error(insertError?.message || "Could not create job.");
    }

    const { error: slotError } = await service.rpc("create_slots_for_job", {
      p_job_id: insertedJob.id,
    });

    if (slotError) {
      return NextResponse.json(
        {
          error: `Job created, but slot creation failed: ${slotError.message}`,
          jobId: insertedJob.id,
        },
        { status: 500 }
      );
    }

    await applyCleanerTrainingRotationToJob(service, insertedJob.id);

    const { data: offerSlots, error: offerSlotsError } = await service
      .from("turnover_job_slots")
      .select("id")
      .eq("job_id", insertedJob.id)
      .eq("status", "offered")
      .not("cleaner_account_id", "is", null);

    if (offerSlotsError) throw new Error(offerSlotsError.message);

    const offerSlotIds = (offerSlots ?? []).map((slot) => slot.id).filter(Boolean);
    const notificationResult =
      offerSlotIds.length > 0
        ? await sendJobOfferEmailsForSlots("cleaner", offerSlotIds, request.nextUrl.origin, {
            allowedOrganizationIds: new Set([organizationId]),
          })
        : { sent: 0, pushSent: 0, skipped: 0, errors: [] as string[] };

    await writeAuditLog(service, {
      actorProfileId: profile.id,
      actorEmail: profile.email || user.email || null,
      actorRole: profile.role,
      organizationId,
      actionType: "admin.create_cleaning_job",
      targetType: "turnover_jobs",
      targetId: insertedJob.id,
      metadata: {
        property_id: propertyId,
        scheduled_for: scheduledFor,
        cleaner_units_needed: cleanerUnitsNeeded,
        offer_slot_count: offerSlotIds.length,
        notifications_sent: notificationResult.sent,
        push_sent: notificationResult.pushSent,
        notification_error_count: notificationResult.errors.length,
      },
    });

    return NextResponse.json({
      ok: true,
      jobId: insertedJob.id,
      notification: notificationResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create cleaning job." },
      { status: 500 }
    );
  }
}
