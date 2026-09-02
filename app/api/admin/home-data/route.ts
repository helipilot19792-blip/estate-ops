import { createClient } from "@supabase/supabase-js";
import { assertWorkspaceBillingAccess } from "@/lib/server/workspace-billing-status";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function createAuthClient(token: string) {
  return createClient(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function isOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message || "";
  return (
    error?.code === "PGRST205" ||
    message.includes("Could not find the table") ||
    message.includes("does not exist")
  );
}

function emptyResult<T = unknown>() {
  return Promise.resolve({ data: [] as T[], error: null });
}

async function requireAdminAccess(token: string, organizationId: string) {
  const authClient = createAuthClient(token);
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : "";

  if (claimsError || !userId) {
    throw new Error("Not authenticated.");
  }

  const [profileResult, membershipResult] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("id,role")
      .eq("id", userId)
      .single(),
    serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", userId)
      .maybeSingle(),
  ]);

  const { data: profile, error: profileError } = profileResult;

  if (profileError || !profile) {
    throw new Error("No profile was found for this user.");
  }

  if (profile.role === "platform_admin") {
    return { user: { id: userId }, profile };
  }

  const { data: membership, error: membershipError } = membershipResult;

  if (membershipError || membership?.role !== "admin") {
    throw new Error("Admin access required for this organization.");
  }

  return { user: { id: userId }, profile };
}

async function requireWorkspaceBillingAccess(organizationId: string) {
  const { data: organization, error } = await serviceClient
    .from("organizations")
    .select("subscription_status,trial_ends_at,account_type,plan_name")
    .eq("id", organizationId)
    .maybeSingle();

  if (error || !organization) {
    throw new Error(error?.message || "Organization not found.");
  }

  return assertWorkspaceBillingAccess(organization);
}

export async function GET(request: Request) {
  const requestStartedAt = Date.now();

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "";
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId")?.trim() || "";
    const priorityOnly = searchParams.get("priority") === "1";

    if (!token) {
      return Response.json({ ok: false, error: "Missing authorization header." }, { status: 401 });
    }

    if (!organizationId) {
      return Response.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    }

    await Promise.all([
      requireAdminAccess(token, organizationId),
      requireWorkspaceBillingAccess(organizationId),
    ]);
    const accessFinishedAt = Date.now();

    const todayYmd = new Date().toISOString().slice(0, 10);
    // The first paint only needs today's operational picture and a small safety
    // window. The client hydrates the complete workspace after this response.
    const priorityEndYmd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const bookingLookaheadEndYmd = priorityOnly
      ? priorityEndYmd
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const jobsQuery = serviceClient
      .from("turnover_jobs")
      .select("*,turnover_job_slots(*)")
      .eq("organization_id", organizationId)
      .order("scheduled_for", { ascending: true });
    const groundsJobsQuery = serviceClient
      .from("grounds_jobs")
      .select("*,grounds_job_slots(*)")
      .eq("organization_id", organizationId)
      .order("scheduled_for", { ascending: true });

    if (priorityOnly) {
      // Keep the floating attention banner accurate even when an offer is for a
      // later date. Waiting jobs are a small subset, unlike the full history.
      jobsQuery.or(
        `and(scheduled_for.gte.${todayYmd},scheduled_for.lte.${priorityEndYmd}),staffing_status.eq.offered,staffing_status.eq.partially_filled,staffing_status.eq.unassigned,staffing_status.eq.unfilled,staffing_status.eq.stranded,status.eq.offered`
      );
      groundsJobsQuery.gte("scheduled_for", todayYmd).lte("scheduled_for", priorityEndYmd);
    }

    const [
      propertiesRes,
      cleanerAccountsRes,
      jobsRes,
      groundsAccountsRes,
      groundsJobsRes,
      propertyBookingEventsRes,
      maintenanceFlagsRes,
      inspectionRulesRes,
      staffJobStatusEventsRes,
      jobOfferAuditLogsRes,
      turnoverJobChecklistItemsRes,
    ] = await Promise.all([
      serviceClient
        .from("properties")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      serviceClient
        .from("cleaner_accounts")
        .select("*,cleaner_account_members(*)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      jobsQuery,
      serviceClient
        .from("grounds_accounts")
        .select("*,grounds_account_members(*)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      groundsJobsQuery,
      serviceClient
        .from("property_booking_events")
        .select("*")
        .eq("organization_id", organizationId)
        .lte("checkin_date", bookingLookaheadEndYmd)
        .gte("checkout_date", todayYmd)
        .order("checkin_date", { ascending: true }),
      serviceClient
        .from("property_maintenance_flags")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      serviceClient
        .from("property_inspection_rules")
        .select("*")
        .eq("organization_id", organizationId)
        .order("next_due_date", { ascending: true }),
      serviceClient
        .from("staff_job_status_events")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(priorityOnly ? 25 : 100),
      serviceClient
        .from("audit_logs")
        .select("id, organization_id, action_type, target_type, target_id, metadata, created_at")
        .eq("organization_id", organizationId)
        .in("action_type", [
          "admin.reassign_cleaner_slot",
          "admin.assign_self_cleaner",
          "admin.release_cleaner_future_job_stranded",
          "admin.approve_cleaner_release_request",
          "admin.send_job_offer_notifications",
          "admin.accept_cleaner_job_on_behalf",
          "admin.decline_cleaner_job_on_behalf",
          "cleaner.portal_job_accept",
          "cleaner.portal_job_decline",
          "cleaner.email_job_accept",
          "cleaner.email_job_decline",
          "cleaner.release_cleaner_slot",
          "cleaner.release_cleaner_slot_stranded",
          "ai.supervisor.turnover_rescue_approved",
          "calendar.cleaning_date_changed",
        ])
        .order("created_at", { ascending: false })
        .limit(500),
      priorityOnly
        ? emptyResult()
        : serviceClient
            .from("turnover_job_checklist_items")
            .select("*")
            .eq("organization_id", organizationId)
            .order("sort_order", { ascending: true }),
    ]);
    const primaryQueriesFinishedAt = Date.now();

    const requiredResponses = [
      propertiesRes,
      cleanerAccountsRes,
      jobsRes,
      groundsAccountsRes,
      groundsJobsRes,
      maintenanceFlagsRes,
      inspectionRulesRes,
    ];

    for (const response of requiredResponses) {
      if (response.error) {
        throw new Error(response.error.message);
      }
    }

    const properties = propertiesRes.data ?? [];
    const propertyIds = properties.map((property: { id: string }) => property.id);
    const strandedJobsRes = propertyIds.length > 0
      ? await serviceClient
          .from("admin_stranded_jobs")
          .select("*")
          .in("property_id", propertyIds)
          .order("created_at", { ascending: true })
      : await emptyResult();
    const childQueriesFinishedAt = Date.now();

    if (strandedJobsRes.error) {
      throw new Error(strandedJobsRes.error.message);
    }

    type WithRelation<T extends string> = Record<string, unknown> & Record<T, unknown[]>;
    const cleanerAccountRows = (cleanerAccountsRes.data ?? []) as WithRelation<"cleaner_account_members">[];
    const jobRows = (jobsRes.data ?? []) as WithRelation<"turnover_job_slots">[];
    const groundsAccountRows = (groundsAccountsRes.data ?? []) as WithRelation<"grounds_account_members">[];
    const groundsJobRows = (groundsJobsRes.data ?? []) as WithRelation<"grounds_job_slots">[];
    const withoutRelation = <T extends string>(row: WithRelation<T>, relation: T) => {
      const rest: Record<string, unknown> = { ...row };
      delete rest[relation];
      return rest;
    };

    const response = Response.json({
      ok: true,
      data: {
        properties,
        cleanerAccounts: cleanerAccountRows.map((row) => withoutRelation(row, "cleaner_account_members")),
        cleanerAccountMembers: cleanerAccountRows.flatMap((row) => row.cleaner_account_members ?? []),
        jobs: jobRows.map((row) => withoutRelation(row, "turnover_job_slots")),
        jobSlots: jobRows.flatMap((row) => row.turnover_job_slots ?? []),
        groundsAccounts: groundsAccountRows.map((row) => withoutRelation(row, "grounds_account_members")),
        groundsAccountMembers: groundsAccountRows.flatMap((row) => row.grounds_account_members ?? []),
        groundsJobs: groundsJobRows.map((row) => withoutRelation(row, "grounds_job_slots")),
        groundsJobSlots: groundsJobRows.flatMap((row) => row.grounds_job_slots ?? []),
        strandedJobs: strandedJobsRes.data ?? [],
        propertyBookingEvents:
          propertyBookingEventsRes.error && isOptionalTableError(propertyBookingEventsRes.error)
            ? []
            : propertyBookingEventsRes.data ?? [],
        maintenanceFlags: maintenanceFlagsRes.data ?? [],
        inspectionRules: inspectionRulesRes.data ?? [],
        staffJobStatusEvents:
          staffJobStatusEventsRes.error && isOptionalTableError(staffJobStatusEventsRes.error)
            ? []
            : staffJobStatusEventsRes.data ?? [],
        jobOfferAuditLogs:
          jobOfferAuditLogsRes.error && isOptionalTableError(jobOfferAuditLogsRes.error)
            ? []
            : jobOfferAuditLogsRes.data ?? [],
        turnoverJobChecklistItems:
          turnoverJobChecklistItemsRes.error && isOptionalTableError(turnoverJobChecklistItemsRes.error)
            ? []
            : turnoverJobChecklistItemsRes.data ?? [],
      },
    });
    const responseReadyAt = Date.now();
    response.headers.set(
      "Server-Timing",
      [
        `access;dur=${accessFinishedAt - requestStartedAt}`,
        `primary;dur=${primaryQueriesFinishedAt - accessFinishedAt}`,
        `children;dur=${childQueriesFinishedAt - primaryQueriesFinishedAt}`,
        `serialize;dur=${responseReadyAt - childQueriesFinishedAt}`,
        `total;dur=${responseReadyAt - requestStartedAt}`,
      ].join(", ")
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 }
    );
  }
}
