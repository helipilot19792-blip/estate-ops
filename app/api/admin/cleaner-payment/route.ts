import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/server/audit-log";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PAYOUT_TYPES = new Set(["standard", "hourly", "light_clean", "extra_clean", "custom"]);
const PAYMENT_STATUSES = new Set(["unpaid", "partial", "paid"]);

function normalizeMoney(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
  return Math.round(parsed * 100) / 100;
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
    .select("id, email, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  const typedProfile = profile as { id: string; email: string | null; role: string | null } | null;
  if (!typedProfile || (typedProfile.role !== "admin" && typedProfile.role !== "platform_admin")) {
    throw new Error("Admin access required.");
  }

  if (typedProfile.role !== "platform_admin") {
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

  return { user, profile: typedProfile };
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase server environment variables." }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const slotId = String(body?.slotId || "").trim();
    const payoutType = String(body?.payoutType || "standard").trim();
    const paymentStatus = String(body?.paymentStatus || "unpaid").trim();
    const payoutNotes = String(body?.payoutNotes || "").trim() || null;
    const paymentNotes = String(body?.paymentNotes || "").trim() || null;
    const expectedPayoutAmount = normalizeMoney(body?.expectedPayoutAmount);
    const paidAmountInput = normalizeMoney(body?.paidAmount);

    if (!organizationId || !slotId) {
      return NextResponse.json({ error: "Missing organization or slot." }, { status: 400 });
    }

    if (!PAYOUT_TYPES.has(payoutType)) {
      return NextResponse.json({ error: "Choose a valid payout type." }, { status: 400 });
    }

    if (!PAYMENT_STATUSES.has(paymentStatus)) {
      return NextResponse.json({ error: "Choose a valid payment status." }, { status: 400 });
    }

    if (expectedPayoutAmount === null || Number.isNaN(expectedPayoutAmount)) {
      return NextResponse.json({ error: "Expected payout amount must be a valid non-negative number." }, { status: 400 });
    }

    if (paidAmountInput !== null && Number.isNaN(paidAmountInput)) {
      return NextResponse.json({ error: "Paid amount must be a valid non-negative number." }, { status: 400 });
    }

    const paidAmount =
      paymentStatus === "unpaid"
        ? null
        : paidAmountInput === null
          ? expectedPayoutAmount
          : paidAmountInput;

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { user, profile } = await requireAdmin(service, token, organizationId);

    const { data: slot, error: slotError } = await service
      .from("turnover_job_slots")
      .select("id, job_id, cleaner_account_id, slot_number")
      .eq("id", slotId)
      .maybeSingle();

    if (slotError) {
      return NextResponse.json({ error: slotError.message }, { status: 500 });
    }

    if (!slot) {
      return NextResponse.json({ error: "Cleaner slot not found." }, { status: 404 });
    }

    const { data: job, error: jobError } = await service
      .from("turnover_jobs")
      .select("id, organization_id, property_id")
      .eq("id", slot.job_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: "Cleaning job not found in this organization." }, { status: 404 });
    }

    if (!slot.cleaner_account_id) {
      return NextResponse.json({ error: "This slot is not assigned to a cleaner account yet." }, { status: 400 });
    }

    const paidAt = paymentStatus === "unpaid" ? null : new Date().toISOString();

    const { data: updatedSlot, error: updateError } = await service
      .from("turnover_job_slots")
      .update({
        payout_type: payoutType,
        expected_payout_amount: expectedPayoutAmount,
        paid_amount: paidAmount,
        payment_status: paymentStatus,
        payout_notes: payoutNotes,
        payment_notes: paymentNotes,
        paid_at: paidAt,
        payment_recorded_by_profile_id: profile.id,
      })
      .eq("id", slotId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { error: paymentRecordError } = await service
      .from("cleaner_payment_records")
      .insert({
        organization_id: organizationId,
        property_id: job.property_id,
        cleaner_account_id: slot.cleaner_account_id,
        job_id: job.id,
        slot_id: slotId,
        payout_type: payoutType,
        expected_payout_amount: expectedPayoutAmount,
        paid_amount: paidAmount,
        payment_status: paymentStatus,
        payout_notes: payoutNotes,
        payment_notes: paymentNotes,
        paid_at: paidAt,
        recorded_by_profile_id: profile.id,
      });

    if (paymentRecordError) {
      return NextResponse.json({ error: paymentRecordError.message }, { status: 500 });
    }

    await writeAuditLog(service, {
      actorProfileId: profile.id,
      actorEmail: profile.email || user.email || null,
      actorRole: profile.role,
      organizationId,
      actionType: "admin.update_cleaner_slot_payment",
      targetType: "turnover_job_slots",
      targetId: slotId,
      metadata: {
        job_id: job.id,
        property_id: job.property_id,
        cleaner_account_id: slot.cleaner_account_id,
        slot_number: slot.slot_number,
        payout_type: payoutType,
        expected_payout_amount: expectedPayoutAmount,
        paid_amount: paidAmount,
        payment_status: paymentStatus,
      },
    });

    return NextResponse.json({ ok: true, slot: updatedSlot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save cleaner payment.";
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("Admin access required") ? 403 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
