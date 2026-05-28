import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendJobOfferEmailsForSlots } from "@/lib/server/job-notifications";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function extractCheckoutDate(notes: string | null): string | null {
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
  const accepted = slotRows.filter((slot: any) => slot.status === "accepted").length;
  const offered = slotRows.filter((slot: any) => slot.status === "offered").length;
  const stillStranded = slotRows.some(
    (slot: any) => slot.status === "stranded" || !slot.cleaner_account_id
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
    .select("id, role")
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
    const action = body?.action === "delete" ? "delete" : body?.action === "reassign" ? "reassign" : null;
    const organizationId = String(body?.organizationId || "").trim();
    const jobId = String(body?.jobId || "").trim();
    const cleanerAccountId = String(body?.cleanerAccountId || "").trim();

    if (!action || !organizationId || !jobId) {
      return NextResponse.json({ error: "Missing stranded job details." }, { status: 400 });
    }

    if (action === "reassign" && !cleanerAccountId) {
      return NextResponse.json({ error: "Choose a cleaner account before reassigning." }, { status: 400 });
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await requireAdmin(service, token, organizationId);

    const { data: job, error: jobError } = await service
      .from("turnover_jobs")
      .select("id, organization_id, property_id, scheduled_for, notes")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: "Stranded job was not found in this organization." }, { status: 404 });
    }

    if (action === "delete") {
      const { error: slotDeleteError } = await service
        .from("turnover_job_slots")
        .delete()
        .eq("job_id", jobId);

      if (slotDeleteError) {
        return NextResponse.json({ error: slotDeleteError.message }, { status: 500 });
      }

      const { data: deletedJob, error: deleteError } = await service
        .from("turnover_jobs")
        .delete()
        .eq("id", jobId)
        .eq("organization_id", organizationId)
        .select("id")
        .maybeSingle();

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      if (!deletedJob) {
        return NextResponse.json({ error: "No job was deleted." }, { status: 409 });
      }

      return NextResponse.json({ ok: true, action, deletedJobId: jobId });
    }

    const { data: account, error: accountError } = await service
      .from("cleaner_accounts")
      .select("id")
      .eq("id", cleanerAccountId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 500 });
    }

    if (!account) {
      return NextResponse.json({ error: "Cleaner account was not found in this organization." }, { status: 404 });
    }

    const { data: slot, error: slotError } = await service
      .from("turnover_job_slots")
      .select("id, slot_number")
      .eq("job_id", jobId)
      .or("status.eq.stranded,cleaner_account_id.is.null")
      .order("slot_number", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (slotError) {
      return NextResponse.json({ error: slotError.message }, { status: 500 });
    }

    if (!slot) {
      return NextResponse.json({ error: "No stranded slot was found for that job." }, { status: 404 });
    }

    const now = new Date();
    const responseHours = getResponseWindowHours(getCleanerJobDate(job), now);
    const { data: updatedSlot, error: updateError } = await service
      .from("turnover_job_slots")
      .update({
        cleaner_account_id: cleanerAccountId,
        status: "offered",
        offered_at: now.toISOString(),
        expires_at: new Date(now.getTime() + responseHours * 60 * 60 * 1000).toISOString(),
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
      return NextResponse.json({ error: "No stranded slot was updated." }, { status: 409 });
    }

    await refreshCleanerJobStaffing(service, jobId);

    const notificationResult = await sendJobOfferEmailsForSlots("cleaner", [updatedSlot.id], request.nextUrl.origin, {
      allowedOrganizationIds: new Set([organizationId]),
    });

    return NextResponse.json({
      ok: true,
      action,
      slotId: updatedSlot.id,
      notificationResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update stranded job.";
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("Admin access required") ? 403 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
