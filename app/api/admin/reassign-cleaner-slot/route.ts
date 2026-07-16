import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/server/audit-log";
import { sendJobOfferEmailsForSlots } from "@/lib/server/job-notifications";
import { detectSameDayCleanerConflicts } from "@/lib/server/same-day-cleaner-conflicts";

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

function extractCheckoutDate(notes: string | null) {
  if (!notes) return null;
  const match = notes.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function getCleanerJobDate(job: { scheduled_for?: string | null; notes?: string | null }) {
  return job.scheduled_for || extractCheckoutDate(job.notes || null);
}

function getResponseWindowHours(jobDate: string | null, now = new Date()) {
  if (!jobDate) return 8;

  const job = new Date(`${jobDate}T12:00:00`);
  const diffHours = (job.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours > 24 * 7) return 48;
  if (diffHours > 48) return 8;
  return 2;
}

async function refreshCleanerJobStaffing(jobId: string) {
  const { data: job, error: jobError } = await service
    .from("turnover_jobs")
    .select("id, cleaner_units_needed")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) return;

  const { data: slots, error: slotError } = await service
    .from("turnover_job_slots")
    .select("id, status, cleaner_account_id")
    .eq("job_id", jobId);

  if (slotError) throw new Error(slotError.message);

  const slotRows = slots ?? [];
  const unitsNeeded = Math.max(1, Number(job.cleaner_units_needed || 1));
  const accepted = slotRows.filter((slot) => slot.status === "accepted").length;
  const offered = slotRows.filter((slot) => slot.status === "offered").length;
  const stillStranded = slotRows.some(
    (slot) => slot.status === "stranded" || !slot.cleaner_account_id
  );

  const staffingStatus = stillStranded
    ? "stranded"
    : accepted >= unitsNeeded
      ? "fully_staffed"
      : accepted > 0 || offered > 0
        ? "partially_filled"
        : "unassigned";
  const status = accepted >= unitsNeeded ? "accepted" : offered > 0 ? "offered" : "open";

  const { error: updateError } = await service
    .from("turnover_jobs")
    .update({
      status,
      staffing_status: staffingStatus,
      offered_at: offered > 0 ? new Date().toISOString() : null,
    })
    .eq("id", jobId);

  if (updateError) throw new Error(updateError.message);
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const authClient = createAuthClient(token);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const jobId = String(body?.jobId || "").trim();
    const slotId = String(body?.slotId || "").trim();
    const cleanerAccountId = String(body?.cleanerAccountId || "").trim();

    if (!organizationId || !jobId || !slotId || !cleanerAccountId) {
      return NextResponse.json({ error: "Missing reassignment details." }, { status: 400 });
    }

    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id, email, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    if (profile.role !== "platform_admin") {
      const { data: membership, error: membershipError } = await service
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

    const { data: job, error: jobError } = await service
      .from("turnover_jobs")
      .select("id, organization_id, property_id, scheduled_for, notes, schedule_conflict_at, schedule_conflict_recommended")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const { data: slot, error: slotError } = await service
      .from("turnover_job_slots")
      .select(`
        id,
        job_id,
        slot_number,
        cleaner_account_id,
        status,
        offered_at,
        accepted_at,
        declined_at
      `)
      .eq("id", slotId)
      .eq("job_id", jobId)
      .maybeSingle();

    if (slotError) {
      return NextResponse.json({ error: slotError.message }, { status: 500 });
    }

    if (!slot) {
      return NextResponse.json({ error: "Job slot not found." }, { status: 404 });
    }

    const blockedStatuses = new Set(["in_progress", "completed"]);
    if (blockedStatuses.has(String(slot.status || "").toLowerCase())) {
      return NextResponse.json(
        { error: "This slot has already been accepted or is already active, so it cannot be reassigned." },
        { status: 409 }
      );
    }
    if (String(slot.status || "").toLowerCase() === "accepted" && !job.schedule_conflict_at) {
      return NextResponse.json(
        { error: "Accepted jobs can only be reassigned when a same-day schedule conflict is active." },
        { status: 409 }
      );
    }

    const { data: cleanerAccount, error: cleanerAccountError } = await service
      .from("cleaner_accounts")
      .select("id, display_name")
      .eq("id", cleanerAccountId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (cleanerAccountError) {
      return NextResponse.json({ error: cleanerAccountError.message }, { status: 500 });
    }

    if (!cleanerAccount) {
      return NextResponse.json({ error: "Cleaner account not found." }, { status: 404 });
    }

    const { data: assignment, error: assignmentError } = await service
      .from("property_cleaner_account_assignments")
      .select("id")
      .eq("property_id", job.property_id)
      .eq("cleaner_account_id", cleanerAccountId)
      .maybeSingle();

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 500 });
    }

    if (!assignment) {
      return NextResponse.json(
        { error: "That cleaner is not assigned to this property. Add them on the Assignments tab first." },
        { status: 400 }
      );
    }

    const previousCleanerId = slot.cleaner_account_id || null;
    let previousCleanerName: string | null = null;
    if (previousCleanerId) {
      const { data: previousCleaner, error: previousCleanerError } = await service
        .from("cleaner_accounts")
        .select("display_name")
        .eq("id", previousCleanerId)
        .maybeSingle();

      if (previousCleanerError) {
        return NextResponse.json({ error: previousCleanerError.message }, { status: 500 });
      }

      previousCleanerName = previousCleaner?.display_name || null;
    }

    const now = new Date();
    const offeredAt = now.toISOString();
    const expiresAt = new Date(
      now.getTime() + getResponseWindowHours(getCleanerJobDate(job), now) * 60 * 60 * 1000
    ).toISOString();

    const { data: updatedSlot, error: updateError } = await service
      .from("turnover_job_slots")
      .update({
        cleaner_account_id: cleanerAccountId,
        status: "offered",
        offered_at: offeredAt,
        expires_at: expiresAt,
        accepted_at: null,
        declined_at: null,
        accepted_by_profile_id: null,
        declined_by_profile_id: null,
        offer_email_sent_at: null,
        offer_reminder_sent_at: null,
        day_of_reminder_sent_at: null,
        offer_push_sent_at: null,
        offer_reminder_push_sent_at: null,
        day_of_reminder_push_sent_at: null,
      })
      .eq("id", slot.id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updatedSlot) {
      return NextResponse.json({ error: "The slot could not be updated." }, { status: 409 });
    }

    await refreshCleanerJobStaffing(jobId);

    if (job.schedule_conflict_at) {
      await detectSameDayCleanerConflicts(service, request.nextUrl.origin);
    }

    await writeAuditLog(service, {
      actorProfileId: profile.id,
      actorEmail: profile.email || user.email || null,
      actorRole: profile.role,
      organizationId,
      actionType: "admin.reassign_cleaner_slot",
      targetType: "turnover_job_slot",
      targetId: slot.id,
      metadata: {
        job_id: jobId,
        slot_number: slot.slot_number,
        previous_cleaner_account_id: previousCleanerId,
        previous_cleaner_name: previousCleanerName,
        previous_status: slot.status,
        previous_offered_at: slot.offered_at,
        previous_accepted_at: slot.accepted_at,
        previous_declined_at: slot.declined_at,
        new_cleaner_account_id: cleanerAccount.id,
        new_cleaner_name: cleanerAccount.display_name || null,
      },
    });

    const notificationResult = await sendJobOfferEmailsForSlots("cleaner", [slot.id], request.nextUrl.origin, {
      allowedOrganizationIds: new Set([organizationId]),
    });

    return NextResponse.json({
      ok: true,
      slotId: slot.id,
      notificationResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reassign cleaner slot." },
      { status: 500 }
    );
  }
}
