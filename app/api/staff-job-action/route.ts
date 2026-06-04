import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendAdminJobStatusPush } from "@/lib/server/admin-job-status-notifications";
import { sendJobOfferEmailsForSlots } from "@/lib/server/job-notifications";
import { reofferExpiredCleanerTrainingSlot } from "@/lib/server/cleaner-training-rotation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

    await refreshCleanerJobStaffing(service, updatedSlot.job_id);
    const trainingReoffer =
      action === "decline"
        ? await reofferExpiredCleanerTrainingSlot(service, updatedSlot.id, user.id)
        : { offeredSlotIds: [] as string[] };
    const trainingReofferNotification =
      trainingReoffer.offeredSlotIds.length > 0
        ? await sendJobOfferEmailsForSlots("cleaner", trainingReoffer.offeredSlotIds, request.nextUrl.origin)
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
      adminPush,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update staff job." },
      { status: 500 }
    );
  }
}
