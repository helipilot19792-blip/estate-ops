import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/server/audit-log";

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

async function updateJobStaffing(jobId: string) {
  const { data: slots, error: slotsError } = await service
    .from("turnover_job_slots")
    .select("id, status, cleaner_account_id")
    .eq("job_id", jobId);

  if (slotsError) throw new Error(slotsError.message);

  const slotRows = slots ?? [];
  const accepted = slotRows.filter((slot) =>
    ["accepted", "in_progress", "completed"].includes(String(slot.status || "").toLowerCase())
  ).length;
  const offered = slotRows.filter((slot) => slot.status === "offered").length;
  const stranded = slotRows.some((slot) => slot.status === "stranded" || !slot.cleaner_account_id);

  const { data: job, error: jobError } = await service
    .from("turnover_jobs")
    .select("cleaner_units_needed, cleaner_units_required_strict")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);

  const unitsNeeded = Number(job?.cleaner_units_needed || Math.max(slotRows.length, 1));
  const strict = Boolean(job?.cleaner_units_required_strict);
  const status =
    accepted >= unitsNeeded
      ? "accepted"
      : accepted > 0
        ? "accepted"
        : offered > 0
          ? "offered"
          : stranded
            ? "stranded"
            : "pending";
  const staffingStatus =
    accepted >= unitsNeeded
      ? "fully_staffed"
      : accepted > 0 && strict
        ? "partially_filled"
        : accepted > 0
          ? "ready"
          : offered > 0
            ? "offered"
            : stranded
              ? "stranded"
              : "unassigned";

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

    if (!organizationId || !jobId) {
      return NextResponse.json({ error: "Missing job details." }, { status: 400 });
    }

    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id, email, full_name, phone, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
    if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    if (profile.role !== "platform_admin") {
      const { data: adminMembership, error: adminMembershipError } = await service
        .from("organization_members")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("profile_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (adminMembershipError) return NextResponse.json({ error: adminMembershipError.message }, { status: 500 });
      if (!adminMembership) {
        return NextResponse.json({ error: "Admin access required for this organization." }, { status: 403 });
      }
    }

    const { data: organization, error: organizationError } = await service
      .from("organizations")
      .select("id, organization_type")
      .eq("id", organizationId)
      .maybeSingle();

    if (organizationError) return NextResponse.json({ error: organizationError.message }, { status: 500 });
    if (!organization) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

    const { data: job, error: jobError } = await service
      .from("turnover_jobs")
      .select("id, organization_id, property_id")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
    if (!job) return NextResponse.json({ error: "Job not found in this organization." }, { status: 404 });

    const { data: existingMemberships, error: existingMembershipsError } = await service
      .from("cleaner_account_members")
      .select("cleaner_account_id")
      .eq("profile_id", user.id);

    if (existingMembershipsError) {
      return NextResponse.json({ error: existingMembershipsError.message }, { status: 500 });
    }

    const existingCleanerAccountIds = (existingMemberships || [])
      .map((membership) => membership.cleaner_account_id)
      .filter(Boolean);

    let cleanerAccountId: string | null = null;

    if (existingCleanerAccountIds.length > 0) {
      const { data: existingAccount, error: existingAccountError } = await service
        .from("cleaner_accounts")
        .select("id, active")
        .eq("organization_id", organizationId)
        .in("id", existingCleanerAccountIds)
        .limit(1)
        .maybeSingle();

      if (existingAccountError) return NextResponse.json({ error: existingAccountError.message }, { status: 500 });

      cleanerAccountId = existingAccount?.id || null;

      if (existingAccount && existingAccount.active === false) {
        const { error: activateError } = await service
          .from("cleaner_accounts")
          .update({ active: true })
          .eq("id", existingAccount.id);

        if (activateError) return NextResponse.json({ error: activateError.message }, { status: 500 });
      }
    }

    if (!cleanerAccountId) {
      const { data: insertedAccount, error: insertedAccountError } = await service
        .from("cleaner_accounts")
        .insert({
          organization_id: organizationId,
          display_name: profile.full_name || profile.email || "Cleaner admin",
          email: profile.email || null,
          phone: profile.phone || null,
          active: true,
        })
        .select("id")
        .single();

      if (insertedAccountError || !insertedAccount) {
        return NextResponse.json(
          { error: insertedAccountError?.message || "Could not create your cleaner account." },
          { status: 500 }
        );
      }

      cleanerAccountId = insertedAccount.id;

      const { error: memberInsertError } = await service.from("cleaner_account_members").insert({
        cleaner_account_id: cleanerAccountId,
        profile_id: user.id,
      });

      if (memberInsertError) return NextResponse.json({ error: memberInsertError.message }, { status: 500 });
    }

    const { data: existingAssignment, error: assignmentLookupError } = await service
      .from("property_cleaner_account_assignments")
      .select("id")
      .eq("property_id", job.property_id)
      .eq("cleaner_account_id", cleanerAccountId)
      .maybeSingle();

    if (assignmentLookupError) {
      return NextResponse.json({ error: assignmentLookupError.message }, { status: 500 });
    }

    if (!existingAssignment) {
      const { error: assignmentInsertError } = await service.from("property_cleaner_account_assignments").insert({
        property_id: job.property_id,
        cleaner_account_id: cleanerAccountId,
        priority: 1,
      });

      if (assignmentInsertError) {
        return NextResponse.json({ error: assignmentInsertError.message }, { status: 500 });
      }
    }

    const { data: alreadyAssignedSlot, error: alreadyAssignedError } = await service
      .from("turnover_job_slots")
      .select("id, status")
      .eq("job_id", jobId)
      .eq("cleaner_account_id", cleanerAccountId)
      .not("status", "eq", "declined")
      .limit(1)
      .maybeSingle();

    if (alreadyAssignedError) {
      return NextResponse.json({ error: alreadyAssignedError.message }, { status: 500 });
    }

    if (alreadyAssignedSlot) {
      return NextResponse.json({
        ok: true,
        cleanerAccountId,
        slotId: alreadyAssignedSlot.id,
        alreadyAssigned: true,
      });
    }

    const { data: slot, error: slotError } = await service
      .from("turnover_job_slots")
      .select("id, slot_number")
      .eq("job_id", jobId)
      .not("status", "in", "(accepted,in_progress,completed)")
      .order("slot_number", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (slotError) return NextResponse.json({ error: slotError.message }, { status: 500 });
    if (!slot) {
      return NextResponse.json({ error: "No open cleaner slot is available for this job." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { data: updatedSlot, error: updateSlotError } = await service
      .from("turnover_job_slots")
      .update({
        cleaner_account_id: cleanerAccountId,
        status: "accepted",
        accepted_at: now,
        accepted_by_profile_id: user.id,
        offered_at: now,
        expires_at: null,
        declined_at: null,
        declined_by_profile_id: null,
      })
      .eq("id", slot.id)
      .select("id")
      .single();

    if (updateSlotError || !updatedSlot) {
      return NextResponse.json({ error: updateSlotError?.message || "Could not assign you to this job." }, { status: 500 });
    }

    await updateJobStaffing(jobId);

    await writeAuditLog(service, {
      actorProfileId: profile.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      organizationId,
      actionType: "admin.assign_self_cleaner",
      targetType: "turnover_job",
      targetId: jobId,
      metadata: {
        cleaner_account_id: cleanerAccountId,
        slot_id: updatedSlot.id,
        organization_type: organization.organization_type,
      },
    });

    return NextResponse.json({
      ok: true,
      cleanerAccountId,
      slotId: updatedSlot.id,
      alreadyAssigned: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not assign you to this job." },
      { status: 500 }
    );
  }
}
