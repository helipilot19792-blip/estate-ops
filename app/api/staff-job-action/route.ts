import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendAdminJobStatusPush } from "@/lib/server/admin-job-status-notifications";
import { sendJobOfferEmailsForSlots } from "@/lib/server/job-notifications";
import { reofferExpiredCleanerTrainingSlot } from "@/lib/server/cleaner-training-rotation";
import { writeAuditLog } from "@/lib/server/audit-log";
import { detectSameDayCleanerConflicts } from "@/lib/server/same-day-cleaner-conflicts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function extractCheckoutDate(notes: string | null) {
  if (!notes) return null;
  const match = notes.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function getJobDate(job: { scheduled_for?: string | null; notes?: string | null }) {
  return job.scheduled_for || extractCheckoutDate(job.notes || null);
}

function getResponseWindowHours(jobDate: string | null, now = new Date()) {
  if (!jobDate) return 8;

  const job = new Date(`${jobDate}T12:00:00`);
  const diff = (job.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diff > 24 * 7) return 48;
  if (diff > 48) return 8;
  return 2;
}

function pickNextBackupCleaner(
  assignments: Array<{ cleaner_account_id: string | null; priority?: number | null }>,
  currentCleanerAccountId: string
) {
  const ordered = [...assignments].sort(
    (a, b) => Number(a.priority ?? Number.MAX_SAFE_INTEGER) - Number(b.priority ?? Number.MAX_SAFE_INTEGER)
  );
  const currentIndex = ordered.findIndex((assignment) => assignment.cleaner_account_id === currentCleanerAccountId);

  if (currentIndex >= 0) {
    for (let index = currentIndex + 1; index < ordered.length; index += 1) {
      const cleanerAccountId = ordered[index]?.cleaner_account_id;
      if (cleanerAccountId && cleanerAccountId !== currentCleanerAccountId) {
        return cleanerAccountId;
      }
    }
    return null;
  }

  return ordered.find((assignment) => assignment.cleaner_account_id && assignment.cleaner_account_id !== currentCleanerAccountId)
    ?.cleaner_account_id || null;
}

async function refreshCleanerJobStaffing(service: any, jobId: string) {
  const { data: job, error: jobError } = await service
    .from("turnover_jobs")
    .select("id, cleaner_units_needed")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) return;

  const { data: slots, error: slotError } = await service
    .from("turnover_job_slots")
    .select("id, status, cleaner_account_id, accepted_at, offered_at")
    .eq("job_id", jobId);

  if (slotError) throw new Error(slotError.message);

  const slotRows = slots ?? [];
  const needed = Math.max(1, Number(job.cleaner_units_needed || 1));
  const activeSlots = slotRows.filter((slot: any) =>
    ["accepted", "in_progress", "completed"].includes(String(slot.status || "").toLowerCase())
  );
  const acceptedSlots = slotRows.filter((slot: any) =>
    ["accepted", "in_progress"].includes(String(slot.status || "").toLowerCase())
  );
  const completedSlots = slotRows.filter((slot: any) => slot.status === "completed");
  const offeredSlots = slotRows.filter((slot: any) => slot.status === "offered");
  const stillStranded = slotRows.some(
    (slot: any) => slot.status === "stranded" || !slot.cleaner_account_id
  );

  const staffingStatus = stillStranded
    ? "stranded"
    : activeSlots.length >= needed
      ? "fully_staffed"
      : activeSlots.length > 0 || offeredSlots.length > 0
        ? "partially_filled"
        : "unassigned";

  const status =
    completedSlots.length >= needed
      ? "completed"
      : acceptedSlots.some((slot: any) => slot.status === "in_progress")
        ? "in_progress"
        : activeSlots.length > 0
      ? "accepted"
      : offeredSlots.length > 0
        ? "offered"
        : "open";

  const earliestOfferedAt =
    offeredSlots
      .map((slot: any) => slot.offered_at)
      .filter(Boolean)
      .sort()[0] || null;
  const earliestAcceptedAt =
    acceptedSlots
      .map((slot: any) => slot.accepted_at)
      .filter(Boolean)
      .sort()[0] || null;

  const { error: updateError } = await service
    .from("turnover_jobs")
    .update({
      status,
      staffing_status: staffingStatus,
      offered_at: earliestOfferedAt,
      accepted_at: earliestAcceptedAt,
    })
    .eq("id", jobId);

  if (updateError) throw new Error(updateError.message);
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

    const body = await request.json().catch(() => null);
    const portal = body?.portal === "cleaner" ? "cleaner" : null;
    const action =
      body?.action === "accept"
        ? "accept"
        : body?.action === "decline"
          ? "decline"
        : body?.action === "release"
          ? "release"
        : body?.action === "start"
          ? "start"
          : body?.action === "arrive"
            ? "arrive"
            : body?.action === "finish"
              ? "finish"
              : null;
    const slotId = String(body?.slotId || "").trim();

    if (!portal || !action || !slotId) {
      return NextResponse.json({ error: "Missing staff job action details." }, { status: 400 });
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
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: memberships, error: membershipError } = await service
      .from("cleaner_account_members")
      .select("cleaner_account_id")
      .eq("profile_id", user.id);

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    const cleanerAccountIds = [
      ...new Set((memberships ?? []).map((row: any) => row.cleaner_account_id).filter(Boolean)),
    ];

    if (cleanerAccountIds.length === 0) {
      return NextResponse.json({ error: "This sign-in is not linked to a cleaner account." }, { status: 403 });
    }

    const { data: currentProfile, error: profileError } = await service
      .from("profiles")
      .select("id, role, email")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    let slotResult = await service
      .from("turnover_job_slots")
      .select("id, job_id, cleaner_account_id, status, started_at, started_by_profile_id")
      .eq("id", slotId)
      .maybeSingle();

    if (slotResult.error?.code === "42703") {
      slotResult = await service
        .from("turnover_job_slots")
        .select("id, job_id, cleaner_account_id, status")
        .eq("id", slotId)
        .maybeSingle();
    }

    const slot = slotResult.data;
    const slotError = slotResult.error;

    if (slotError) {
      return NextResponse.json({ error: slotError.message }, { status: 500 });
    }

    if (!slot) {
      return NextResponse.json({ error: "Job slot was not found." }, { status: 404 });
    }

    if (!slot.cleaner_account_id || !cleanerAccountIds.includes(slot.cleaner_account_id)) {
      return NextResponse.json({ error: "This job slot is not assigned to your cleaner account." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const currentSlotStatus = String(slot.status || "").toLowerCase().trim();

    if ((action === "start" || action === "finish") && !["accepted", "in_progress", "completed"].includes(currentSlotStatus)) {
      return NextResponse.json({ error: "Accept the job before using progress buttons." }, { status: 409 });
    }

    if (action === "arrive" && !["accepted", "in_progress", "completed"].includes(currentSlotStatus)) {
      return NextResponse.json({ error: "Accept the job before marking arrival." }, { status: 409 });
    }

    if (action === "release" && currentSlotStatus !== "accepted") {
      return NextResponse.json({ error: "Only accepted jobs can be released to a backup cleaner." }, { status: 409 });
    }

    if (action === "arrive") {
      const { data: existingArrivalRows } = await service
        .from("staff_job_status_events")
        .select("id")
        .eq("job_kind", "cleaner")
        .eq("job_id", slot.job_id)
        .eq("account_id", slot.cleaner_account_id)
        .eq("event_type", "arrived")
        .limit(1);

      if (existingArrivalRows?.length) {
        return NextResponse.json({
          ok: true,
          action,
          slot: {
            id: slot.id,
            job_id: slot.job_id,
            status: slot.status,
            cleaner_account_id: slot.cleaner_account_id,
          },
          trainingReoffer: { offeredSlotIds: [] },
          trainingReofferNotification: null,
          adminPush: { sent: 0, errors: [] as string[], skippedDuplicate: true },
        });
      }

      const adminPush = await sendAdminJobStatusPush(
        service,
        "cleaner",
        slot.job_id,
        slot.cleaner_account_id,
        "arrived",
        request.nextUrl.origin
      );

      return NextResponse.json({
        ok: true,
        action,
        slot: {
          id: slot.id,
          job_id: slot.job_id,
          status: slot.status,
          cleaner_account_id: slot.cleaner_account_id,
        },
        trainingReoffer: { offeredSlotIds: [] },
        trainingReofferNotification: null,
        adminPush,
      });
    }

    if (action === "release") {
      const { data: job, error: jobError } = await service
        .from("turnover_jobs")
        .select("id, organization_id, property_id, scheduled_for, notes")
        .eq("id", slot.job_id)
        .maybeSingle();

      if (jobError) {
        return NextResponse.json({ error: jobError.message }, { status: 500 });
      }

      if (!job?.property_id || !job.organization_id) {
        return NextResponse.json({ error: "This job is missing property details for reassignment." }, { status: 409 });
      }

      const jobDate = getJobDate(job);
      const today = new Date().toISOString().slice(0, 10);
      if (!jobDate || jobDate < today) {
        return NextResponse.json(
          { error: "Only today's or future accepted jobs can be released to a backup cleaner." },
          { status: 409 }
        );
      }

      const { data: assignments, error: assignmentsError } = await service
        .from("property_cleaner_account_assignments")
        .select("cleaner_account_id, priority")
        .eq("property_id", job.property_id)
        .order("priority", { ascending: true });

      if (assignmentsError) {
        return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
      }

      const replacementCleanerId = pickNextBackupCleaner(assignments || [], slot.cleaner_account_id);
      if (!replacementCleanerId) {
        const { data: strandedSlot, error: strandError } = await service
          .from("turnover_job_slots")
          .update({
            cleaner_account_id: null,
            status: "stranded",
            accepted_at: null,
            declined_at: null,
            accepted_by_profile_id: null,
            declined_by_profile_id: null,
            offered_at: null,
            expires_at: null,
            offer_email_sent_at: null,
            offer_reminder_sent_at: null,
            day_of_reminder_sent_at: null,
            offer_push_sent_at: null,
            offer_reminder_push_sent_at: null,
            day_of_reminder_push_sent_at: null,
          })
          .eq("id", slot.id)
          .eq("cleaner_account_id", slot.cleaner_account_id)
          .eq("status", "accepted")
          .select("id, job_id, status, cleaner_account_id")
          .maybeSingle();

        if (strandError) {
          return NextResponse.json({ error: strandError.message }, { status: 500 });
        }

        if (!strandedSlot) {
          return NextResponse.json({ error: "The job could not be released into the stranded queue." }, { status: 409 });
        }

        await refreshCleanerJobStaffing(service, strandedSlot.job_id);
        await detectSameDayCleanerConflicts(service, request.nextUrl.origin);

        await writeAuditLog(service, {
          actorProfileId: currentProfile?.id || user.id,
          actorEmail: currentProfile?.email || user.email || null,
          actorRole: currentProfile?.role || "cleaner",
          organizationId: job.organization_id,
          actionType: "cleaner.release_cleaner_slot_stranded",
          targetType: "turnover_job_slot",
          targetId: slot.id,
          metadata: {
            job_id: slot.job_id,
            previous_cleaner_account_id: slot.cleaner_account_id,
            previous_status: slot.status,
            released_by_profile_id: user.id,
            reason: "no_backup_cleaner",
          },
        });

        const adminPush = await sendAdminJobStatusPush(
          service,
          "cleaner",
          strandedSlot.job_id,
          null,
          "stranded",
          request.nextUrl.origin
        );

        return NextResponse.json({
          ok: true,
          action,
          slot: strandedSlot,
          stranded: true,
          adminPush,
          message: "No backup cleaner is next in line. The job is now stranded and admin has been alerted.",
        });
      }

      const { data: replacementCleaner, error: replacementCleanerError } = await service
        .from("cleaner_accounts")
        .select("id, display_name")
        .eq("id", replacementCleanerId)
        .maybeSingle();

      if (replacementCleanerError) {
        return NextResponse.json({ error: replacementCleanerError.message }, { status: 500 });
      }

      if (!replacementCleaner) {
        return NextResponse.json({ error: "The backup cleaner account could not be found." }, { status: 404 });
      }

      const nowDate = new Date();
      const offeredAt = nowDate.toISOString();
      const expiresAt = new Date(
        nowDate.getTime() + getResponseWindowHours(jobDate, nowDate) * 60 * 60 * 1000
      ).toISOString();

      const { data: releasedSlot, error: releaseError } = await service
        .from("turnover_job_slots")
        .update({
          cleaner_account_id: replacementCleaner.id,
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
        .eq("cleaner_account_id", slot.cleaner_account_id)
        .select("id, job_id, status, cleaner_account_id")
        .maybeSingle();

      if (releaseError) {
        return NextResponse.json({ error: releaseError.message }, { status: 500 });
      }

      if (!releasedSlot) {
        return NextResponse.json({ error: "The job could not be released to the backup cleaner." }, { status: 409 });
      }

      await refreshCleanerJobStaffing(service, releasedSlot.job_id);
      await detectSameDayCleanerConflicts(service, request.nextUrl.origin);

      await writeAuditLog(service, {
        actorProfileId: currentProfile?.id || user.id,
        actorEmail: currentProfile?.email || user.email || null,
        actorRole: currentProfile?.role || "cleaner",
        organizationId: job.organization_id,
        actionType: "cleaner.release_cleaner_slot",
        targetType: "turnover_job_slot",
        targetId: slot.id,
        metadata: {
          job_id: slot.job_id,
          previous_cleaner_account_id: slot.cleaner_account_id,
          new_cleaner_account_id: replacementCleaner.id,
          new_cleaner_name: replacementCleaner.display_name || null,
          previous_status: slot.status,
          released_by_profile_id: user.id,
        },
      });

      const notificationResult = await sendJobOfferEmailsForSlots("cleaner", [slot.id], request.nextUrl.origin);

      return NextResponse.json({
        ok: true,
        action,
        slot: releasedSlot,
        replacementCleaner: {
          id: replacementCleaner.id,
          display_name: replacementCleaner.display_name || null,
        },
        notificationResult,
      });
    }

    const slotUpdate: Record<string, unknown> =
      action === "accept"
        ? {
            status: "accepted",
            accepted_at: now,
            declined_at: null,
            accepted_by_profile_id: user.id,
            declined_by_profile_id: null,
          }
        : action === "decline"
          ? {
            status: "declined",
            declined_at: now,
            accepted_at: null,
            declined_by_profile_id: user.id,
            accepted_by_profile_id: null,
          }
          : action === "start"
            ? {
                status: "in_progress",
                started_at: now,
                started_by_profile_id: user.id,
              }
            : {
                status: "completed",
                finished_at: now,
                finished_by_profile_id: user.id,
                started_at: slot.started_at || now,
                started_by_profile_id: slot.started_by_profile_id || user.id,
              };

    const { data: updatedSlot, error: updateError } = await service
      .from("turnover_job_slots")
      .update(slotUpdate)
      .eq("id", slotId)
      .eq("cleaner_account_id", slot.cleaner_account_id)
      .select("id, job_id, status, cleaner_account_id")
      .maybeSingle();

    if (updateError) {
      if (updateError.code === "42703" && (action === "start" || action === "finish")) {
        return NextResponse.json(
          { error: "Cleaner progress tracking fields are missing. Run supabase/add_cleaner_job_progress_tracking.sql first." },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updatedSlot) {
      return NextResponse.json({ error: "Job slot could not be updated." }, { status: 409 });
    }

    const { data: auditJob } = await service
      .from("turnover_jobs")
      .select("organization_id, property_id, scheduled_for")
      .eq("id", updatedSlot.job_id)
      .maybeSingle();
    if (auditJob?.organization_id) {
      await writeAuditLog(service, {
        actorProfileId: currentProfile?.id || user.id,
        actorEmail: currentProfile?.email || user.email || null,
        actorRole: currentProfile?.role || "cleaner",
        organizationId: auditJob.organization_id,
        actionType: `cleaner.portal_job_${action}`,
        targetType: "turnover_job_slot",
        targetId: updatedSlot.id,
        metadata: {
          job_id: updatedSlot.job_id,
          property_id: auditJob.property_id || null,
          scheduled_for: auditJob.scheduled_for || null,
          cleaner_account_id: updatedSlot.cleaner_account_id || slot.cleaner_account_id || null,
          previous_status: slot.status || null,
          resulting_status: updatedSlot.status || null,
        },
      });
    }

    await refreshCleanerJobStaffing(service, updatedSlot.job_id);
    const declineAdminPush =
      action === "decline"
        ? await sendAdminJobStatusPush(
            service,
            "cleaner",
            updatedSlot.job_id,
            updatedSlot.cleaner_account_id || slot.cleaner_account_id,
            "declined",
            request.nextUrl.origin
          )
        : null;
    const trainingReoffer =
      action === "decline"
        ? await reofferExpiredCleanerTrainingSlot(service, updatedSlot.id, user.id)
        : { offeredSlotIds: [] as string[] };
    const trainingReofferNotification =
      trainingReoffer.offeredSlotIds.length > 0
        ? await sendJobOfferEmailsForSlots("cleaner", trainingReoffer.offeredSlotIds, request.nextUrl.origin)
        : null;
    const strandedAdminPush =
      action === "decline" && (trainingReoffer.strandedSlotIds?.length || 0) > 0
        ? await sendAdminJobStatusPush(
            service,
            "cleaner",
            updatedSlot.job_id,
            null,
            "stranded",
            request.nextUrl.origin
          )
        : null;
    const adminPush =
      action === "accept" || action === "start" || action === "finish"
        ? await sendAdminJobStatusPush(
            service,
            "cleaner",
            updatedSlot.job_id,
            updatedSlot.cleaner_account_id || slot.cleaner_account_id,
            action === "accept" ? "accepted" : action === "start" ? "started" : "completed",
            request.nextUrl.origin
          )
        : { sent: 0, errors: [] as string[] };

    return NextResponse.json({
      ok: true,
      action,
      slot: updatedSlot,
      trainingReoffer,
      trainingReofferNotification,
      declineAdminPush,
      strandedAdminPush,
      adminPush,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update staff job." },
      { status: 500 }
    );
  }
}
