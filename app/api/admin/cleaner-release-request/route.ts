import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/server/audit-log";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function requireAdmin(service: any, token: string, organizationId: string) {
  const authClient = createClient(supabaseUrl!, publicSupabaseKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Unauthorized.");
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, role, email")
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
    if (!membership) throw new Error("Admin access required for this organization.");
  }

  return { user, profile };
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
    .select("id, status, cleaner_account_id")
    .eq("job_id", jobId);

  if (slotError) throw new Error(slotError.message);

  const slotRows = slots ?? [];
  const unitsNeeded = Math.max(1, Number(job.cleaner_units_needed || 1));
  const accepted = slotRows.filter((slot: any) => ["accepted", "in_progress", "completed"].includes(String(slot.status || "").toLowerCase())).length;
  const offered = slotRows.filter((slot: any) => slot.status === "offered").length;
  const stillStranded = slotRows.some((slot: any) => slot.status === "stranded" || !slot.cleaner_account_id);

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
    })
    .eq("id", jobId);

  if (updateError) throw new Error(updateError.message);
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase server environment variables." }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const requestEventId = String(body?.requestEventId || "").trim();
    const organizationId = String(body?.organizationId || "").trim();

    if (!requestEventId || !organizationId) {
      return NextResponse.json({ error: "Missing release request details." }, { status: 400 });
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { user, profile } = await requireAdmin(service, token, organizationId);

    const { data: requestEvent, error: requestEventError } = await service
      .from("staff_job_status_events")
      .select("*")
      .eq("id", requestEventId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (requestEventError) {
      return NextResponse.json({ error: requestEventError.message }, { status: 500 });
    }

    if (!requestEvent || requestEvent.event_type !== "release_requested") {
      return NextResponse.json({ error: "Release request not found." }, { status: 404 });
    }

    if (String(requestEvent.metadata?.request_status || "pending").toLowerCase().trim() !== "pending") {
      return NextResponse.json({ error: "That release request has already been handled." }, { status: 409 });
    }

    const slotId = String(requestEvent.metadata?.slot_id || "").trim();
    const jobId = String(requestEvent.job_id || "").trim();

    if (!slotId || !jobId) {
      return NextResponse.json({ error: "Release request is missing slot details." }, { status: 409 });
    }

    const { data: slot, error: slotError } = await service
      .from("turnover_job_slots")
      .select("id, job_id, cleaner_account_id, status, slot_number, accepted_at")
      .eq("id", slotId)
      .eq("job_id", jobId)
      .maybeSingle();

    if (slotError) {
      return NextResponse.json({ error: slotError.message }, { status: 500 });
    }

    if (!slot) {
      return NextResponse.json({ error: "Requested slot no longer exists." }, { status: 404 });
    }

    if (String(slot.status || "").toLowerCase().trim() !== "accepted") {
      return NextResponse.json({ error: "Only accepted slots can be released into the stranded queue." }, { status: 409 });
    }

    const { data: updatedSlot, error: updateError } = await service
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
      })
      .eq("id", slot.id)
      .select("id, job_id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updatedSlot) {
      return NextResponse.json({ error: "Slot could not be released." }, { status: 409 });
    }

    await refreshCleanerJobStaffing(service, jobId);

    const nextMetadata = {
      ...(requestEvent.metadata || {}),
      request_status: "approved",
      resolved_at: new Date().toISOString(),
      resolved_by_profile_id: profile.id,
      resolved_by_email: profile.email || user.email || null,
    };

    const { error: requestUpdateError } = await service
      .from("staff_job_status_events")
      .update({
        metadata: nextMetadata,
      })
      .eq("id", requestEvent.id);

    if (requestUpdateError) {
      return NextResponse.json({ error: requestUpdateError.message }, { status: 500 });
    }

    await writeAuditLog(service, {
      actorProfileId: profile.id,
      actorEmail: profile.email || user.email || null,
      actorRole: profile.role,
      organizationId,
      actionType: "admin.approve_cleaner_release_request",
      targetType: "turnover_job_slot",
      targetId: slot.id,
      metadata: {
        job_id: jobId,
        slot_number: slot.slot_number,
        previous_cleaner_account_id: slot.cleaner_account_id,
        previous_status: slot.status,
        source_request_event_id: requestEvent.id,
      },
    });

    return NextResponse.json({
      ok: true,
      slotId: slot.id,
      jobId,
      message: "Cleaner release approved. The slot is now stranded for reassignment.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not approve cleaner release request.";
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("Admin access required") ? 403 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
