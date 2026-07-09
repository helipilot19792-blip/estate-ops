import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/server/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminProfile = {
  id: string;
  email: string | null;
  role: string | null;
};

let serviceClient: SupabaseClient | null = null;

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicSupabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return { supabaseUrl, publicSupabaseKey, serviceRoleKey };
}

function getServiceClient() {
  if (!serviceClient) {
    const { supabaseUrl, serviceRoleKey } = getEnv();
    serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return serviceClient;
}

function createAuthClient(token: string) {
  const { supabaseUrl, publicSupabaseKey } = getEnv();
  return createClient(supabaseUrl, publicSupabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function requireAdmin(service: SupabaseClient, token: string, organizationId: string) {
  const authClient = createAuthClient(token);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized.", status: 401 as const };
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, email, role")
    .eq("id", user.id)
    .maybeSingle<AdminProfile>();

  if (profileError) return { error: profileError.message, status: 500 as const };
  if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
    return { error: "Admin access required.", status: 403 as const };
  }

  if (profile.role !== "platform_admin") {
    const { data: membership, error: membershipError } = await service
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (membershipError) return { error: membershipError.message, status: 500 as const };
    if (!membership) {
      return { error: "Admin access required for this organization.", status: 403 as const };
    }
  }

  return { user, profile };
}

async function refreshCleanerJobStaffing(service: SupabaseClient, jobId: string) {
  const { data: job, error: jobError } = await service
    .from("turnover_jobs")
    .select("id, cleaner_units_needed, cleaner_units_required_strict")
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

  const staffingStatus =
    activeSlots.length >= needed
      ? "fully_staffed"
      : activeSlots.length > 0 && Boolean(job.cleaner_units_required_strict)
        ? "partially_filled"
        : activeSlots.length > 0
          ? "ready"
          : offeredSlots.length > 0
            ? "offered"
            : stillStranded
              ? "stranded"
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
            : stillStranded
              ? "stranded"
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
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const jobId = String(body?.jobId || "").trim();
    const slotId = String(body?.slotId || "").trim();

    if (!organizationId || !jobId || !slotId) {
      return NextResponse.json({ error: "Missing cleaner job details." }, { status: 400 });
    }

    const service = getServiceClient();
    const admin = await requireAdmin(service, token, organizationId);
    if ("error" in admin) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    const { data: job, error: jobError } = await service
      .from("turnover_jobs")
      .select("id, organization_id, property_id")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
    if (!job) return NextResponse.json({ error: "Job not found in this organization." }, { status: 404 });

    const { data: slot, error: slotError } = await service
      .from("turnover_job_slots")
      .select("id, job_id, slot_number, cleaner_account_id, status, offered_at, accepted_at, declined_at")
      .eq("id", slotId)
      .eq("job_id", jobId)
      .maybeSingle();

    if (slotError) return NextResponse.json({ error: slotError.message }, { status: 500 });
    if (!slot) return NextResponse.json({ error: "Cleaner job slot not found." }, { status: 404 });
    if (!slot.cleaner_account_id) {
      return NextResponse.json({ error: "Assign a cleaner before accepting on their behalf." }, { status: 400 });
    }

    const currentStatus = String(slot.status || "").toLowerCase();
    if (["accepted", "in_progress", "completed"].includes(currentStatus)) {
      return NextResponse.json({
        ok: true,
        alreadyAccepted: true,
        slotId: slot.id,
      });
    }

    if (!["offered", "stranded"].includes(currentStatus)) {
      return NextResponse.json(
        { error: "Only offered or stranded cleaner slots can be accepted on behalf of a cleaner." },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { data: updatedSlot, error: updateError } = await service
      .from("turnover_job_slots")
      .update({
        status: "accepted",
        accepted_at: now,
        accepted_by_profile_id: admin.profile.id,
        declined_at: null,
        declined_by_profile_id: null,
        expires_at: null,
      })
      .eq("id", slot.id)
      .select("id, job_id, cleaner_account_id, status")
      .maybeSingle();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    if (!updatedSlot) {
      return NextResponse.json({ error: "Cleaner job slot could not be accepted." }, { status: 409 });
    }

    await refreshCleanerJobStaffing(service, jobId);

    await writeAuditLog(service, {
      actorProfileId: admin.profile.id,
      actorEmail: admin.profile.email || admin.user.email || null,
      actorRole: admin.profile.role,
      organizationId,
      actionType: "admin.accept_cleaner_job_on_behalf",
      targetType: "turnover_job_slot",
      targetId: slot.id,
      metadata: {
        job_id: jobId,
        property_id: job.property_id,
        slot_number: slot.slot_number,
        cleaner_account_id: slot.cleaner_account_id,
        previous_status: slot.status,
        previous_offered_at: slot.offered_at,
        previous_accepted_at: slot.accepted_at,
        previous_declined_at: slot.declined_at,
      },
    });

    return NextResponse.json({
      ok: true,
      alreadyAccepted: false,
      slot: updatedSlot,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not accept cleaner job." },
      { status: 500 }
    );
  }
}
