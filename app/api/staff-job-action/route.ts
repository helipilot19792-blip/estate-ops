import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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
  const acceptedSlots = slotRows.filter((slot: any) => slot.status === "accepted");
  const offeredSlots = slotRows.filter((slot: any) => slot.status === "offered");
  const stillStranded = slotRows.some(
    (slot: any) => slot.status === "stranded" || !slot.cleaner_account_id
  );

  const staffingStatus = stillStranded
    ? "stranded"
    : acceptedSlots.length >= needed
      ? "fully_staffed"
      : acceptedSlots.length > 0 || offeredSlots.length > 0
        ? "partially_filled"
        : "unassigned";

  const status =
    acceptedSlots.length > 0
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
    const action = body?.action === "accept" ? "accept" : body?.action === "decline" ? "decline" : null;
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

    const { data: slot, error: slotError } = await service
      .from("turnover_job_slots")
      .select("id, job_id, cleaner_account_id, status")
      .eq("id", slotId)
      .maybeSingle();

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
    const slotUpdate =
      action === "accept"
        ? {
            status: "accepted",
            accepted_at: now,
            declined_at: null,
            accepted_by_profile_id: user.id,
            declined_by_profile_id: null,
          }
        : {
            status: "declined",
            declined_at: now,
            accepted_at: null,
            declined_by_profile_id: user.id,
            accepted_by_profile_id: null,
          };

    const { data: updatedSlot, error: updateError } = await service
      .from("turnover_job_slots")
      .update(slotUpdate)
      .eq("id", slotId)
      .eq("cleaner_account_id", slot.cleaner_account_id)
      .select("id, job_id, status")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updatedSlot) {
      return NextResponse.json({ error: "Job slot could not be updated." }, { status: 409 });
    }

    await refreshCleanerJobStaffing(service, updatedSlot.job_id);

    return NextResponse.json({
      ok: true,
      action,
      slot: updatedSlot,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update staff job." },
      { status: 500 }
    );
  }
}
