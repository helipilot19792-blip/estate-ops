import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendJobOfferDigestEmailForSlots } from "@/lib/server/job-notifications";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type TeamKind = "cleaner" | "grounds";

function getTables(kind: TeamKind) {
  return kind === "cleaner"
    ? {
        accountTable: "cleaner_accounts",
        memberTable: "cleaner_account_members",
        assignmentTable: "property_cleaner_account_assignments",
        accountIdColumn: "cleaner_account_id",
      }
    : {
        accountTable: "grounds_accounts",
        memberTable: "grounds_account_members",
        assignmentTable: "property_grounds_account_assignments",
        accountIdColumn: "grounds_account_id",
      };
}

function roleCanBeAssigned(kind: TeamKind, role: string | null | undefined) {
  if (kind === "cleaner") return role === "cleaner";
  return role === "grounds" || role === "cleaner";
}

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

async function refreshCleanerJobStaffing(serviceClient: any, jobId: string) {
  const { data: job, error: jobError } = await serviceClient
    .from("turnover_jobs")
    .select("id, cleaner_units_needed")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) return;

  const { data: slots, error: slotError } = await serviceClient
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

  const nextStaffingStatus = stillStranded
    ? "stranded"
    : accepted >= unitsNeeded
      ? "fully_staffed"
      : accepted > 0 || offered > 0
        ? "partially_filled"
        : "unassigned";
  const nextStatus = accepted >= unitsNeeded ? "accepted" : offered > 0 ? "offered" : "open";

  const { error: updateError } = await serviceClient
    .from("turnover_jobs")
    .update({
      status: nextStatus,
      staffing_status: nextStaffingStatus,
      offered_at: offered > 0 ? new Date().toISOString() : null,
    })
    .eq("id", jobId);

  if (updateError) throw new Error(updateError.message);
}

async function offerOpenCleanerSlotsForProperty(
  serviceClient: any,
  propertyId: string,
  organizationId: string,
  cleanerAccountId: string,
  origin: string
) {
  const todayYmd = new Date().toISOString().slice(0, 10);
  const { data: jobs, error: jobsError } = await serviceClient
    .from("turnover_jobs")
    .select("id, scheduled_for, notes")
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId);

  if (jobsError) throw new Error(jobsError.message);

  const futureJobIds = (jobs ?? [])
    .filter((job: any) => {
      const jobDate = getCleanerJobDate(job);
      return !!jobDate && jobDate >= todayYmd;
    })
    .map((job: any) => job.id)
    .filter(Boolean);

  if (futureJobIds.length === 0) {
    return { offeredSlotIds: [] as string[], notificationResult: null };
  }

  const { data: slots, error: slotsError } = await serviceClient
    .from("turnover_job_slots")
    .select("id, job_id")
    .in("job_id", futureJobIds)
    .or("status.eq.stranded,cleaner_account_id.is.null");

  if (slotsError) throw new Error(slotsError.message);

  const openSlots = slots ?? [];
  if (openSlots.length === 0) {
    return { offeredSlotIds: [] as string[], notificationResult: null };
  }

  const jobsById = new Map((jobs ?? []).map((job: any) => [job.id, job]));
  const now = new Date();
  const offeredSlotIds: string[] = [];

  for (const slot of openSlots) {
    const job = jobsById.get(slot.job_id) as any;
    const responseHours = getResponseWindowHours(job ? getCleanerJobDate(job) : null, now);

    const { error: updateError } = await serviceClient
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
      .eq("id", slot.id);

    if (updateError) throw new Error(updateError.message);
    offeredSlotIds.push(slot.id);
  }

  const affectedJobIds = [
    ...new Set<string>(
      openSlots
        .map((slot: any) => slot.job_id)
        .filter((jobId: unknown): jobId is string => typeof jobId === "string" && jobId.length > 0)
    ),
  ];

  for (const jobId of affectedJobIds) {
    await refreshCleanerJobStaffing(serviceClient, jobId);
  }

  const notificationResult = await sendJobOfferDigestEmailForSlots("cleaner", offeredSlotIds, origin, {
    allowedOrganizationIds: new Set([organizationId]),
  });

  return { offeredSlotIds, notificationResult };
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

    const authClient = createClient(supabaseUrl, publicSupabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();
    const profileId = String(body?.profileId || "").trim();
    const priority = Number(body?.priority || 1);
    const kind = body?.kind === "grounds" ? "grounds" : body?.kind === "cleaner" ? "cleaner" : null;

    if (!organizationId || !propertyId || !profileId || !kind) {
      return NextResponse.json({ error: "Missing assignment details." }, { status: 400 });
    }

    if (!Number.isInteger(priority) || priority < 1 || priority > 3) {
      return NextResponse.json({ error: "Choose a valid assignment priority." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: currentProfile, error: currentProfileError } = await serviceClient
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (currentProfileError) {
      return NextResponse.json({ error: currentProfileError.message }, { status: 500 });
    }

    if (
      !currentProfile ||
      (currentProfile.role !== "admin" && currentProfile.role !== "platform_admin")
    ) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    if (currentProfile.role !== "platform_admin") {
      const { data: adminMembership, error: adminMembershipError } = await serviceClient
        .from("organization_members")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("profile_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (adminMembershipError) {
        return NextResponse.json({ error: adminMembershipError.message }, { status: 500 });
      }

      if (!adminMembership) {
        return NextResponse.json(
          { error: "Admin access required for this organization." },
          { status: 403 }
        );
      }
    }

    const { data: property, error: propertyError } = await serviceClient
      .from("properties")
      .select("id, organization_id")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 });
    }

    if (!property) {
      return NextResponse.json({ error: "Property not found in this organization." }, { status: 404 });
    }

    const { data: targetProfile, error: targetProfileError } = await serviceClient
      .from("profiles")
      .select("id, role, email, full_name, phone")
      .eq("id", profileId)
      .maybeSingle();

    if (targetProfileError) {
      return NextResponse.json({ error: targetProfileError.message }, { status: 500 });
    }

    if (!targetProfile || !roleCanBeAssigned(kind, targetProfile.role)) {
      return NextResponse.json({ error: "Selected user is not eligible for this assignment." }, { status: 400 });
    }

    const { data: targetMembership, error: targetMembershipError } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (targetMembershipError) {
      return NextResponse.json({ error: targetMembershipError.message }, { status: 500 });
    }

    if (!targetMembership) {
      return NextResponse.json(
        { error: "Selected user is not linked to this organization." },
        { status: 400 }
      );
    }

    const tables = getTables(kind);
    let accountId: string | null = null;

    const { data: existingMemberships, error: existingMembershipError } = await serviceClient
      .from(tables.memberTable)
      .select(tables.accountIdColumn)
      .eq("profile_id", profileId);

    if (existingMembershipError) {
      return NextResponse.json({ error: existingMembershipError.message }, { status: 500 });
    }

    const existingAccountIds = (existingMemberships || [])
      .map((membership: any) => membership?.[tables.accountIdColumn] as string | undefined)
      .filter(Boolean) as string[];

    if (existingAccountIds.length > 0) {
      const { data: existingAccount, error: existingAccountError } = await serviceClient
        .from(tables.accountTable)
        .select("id")
        .eq("organization_id", organizationId)
        .in("id", existingAccountIds)
        .limit(1)
        .maybeSingle();

      if (existingAccountError) {
        return NextResponse.json({ error: existingAccountError.message }, { status: 500 });
      }

      accountId = existingAccount?.id || null;
    }

    if (!accountId) {
      const { data: insertedAccount, error: insertedAccountError } = await serviceClient
        .from(tables.accountTable)
        .insert({
          organization_id: organizationId,
          display_name:
            targetProfile.full_name || targetProfile.email || `${kind === "cleaner" ? "Cleaner" : "Grounds"} account`,
          email: targetProfile.email || null,
          phone: targetProfile.phone || null,
          active: true,
        })
        .select("id")
        .single();

      if (insertedAccountError || !insertedAccount) {
        return NextResponse.json(
          { error: insertedAccountError?.message || `Could not create ${kind} account.` },
          { status: 500 }
        );
      }

      accountId = insertedAccount.id;

      const { error: memberInsertError } = await serviceClient
        .from(tables.memberTable)
        .insert({
          [tables.accountIdColumn]: accountId,
          profile_id: profileId,
        });

      if (memberInsertError) {
        return NextResponse.json({ error: memberInsertError.message }, { status: 500 });
      }
    }

    const { data: assignment, error: assignmentError } = await serviceClient
      .from(tables.assignmentTable)
      .insert({
        property_id: propertyId,
        [tables.accountIdColumn]: accountId,
        priority,
      })
      .select("*")
      .single();

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 500 });
    }

    const cleanerOfferRepair =
      kind === "cleaner" && accountId
        ? await offerOpenCleanerSlotsForProperty(
            serviceClient,
            propertyId,
            organizationId,
            accountId,
            request.nextUrl.origin
          )
        : null;

    return NextResponse.json({
      ok: true,
      assignment,
      accountId,
      cleanerOfferRepair,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save assignment." },
      { status: 500 }
    );
  }
}
