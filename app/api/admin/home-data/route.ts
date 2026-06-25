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
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated.");
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("No profile was found for this user.");
  }

  if (profile.role === "platform_admin") {
    return { user, profile };
  }

  const { data: membership, error: membershipError } = await serviceClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (membershipError || membership?.role !== "admin") {
    throw new Error("Admin access required for this organization.");
  }

  return { user, profile };
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
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "";
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId")?.trim() || "";

    if (!token) {
      return Response.json({ ok: false, error: "Missing authorization header." }, { status: 401 });
    }

    if (!organizationId) {
      return Response.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    }

    await requireAdminAccess(token, organizationId);
    await requireWorkspaceBillingAccess(organizationId);

    const todayYmd = new Date().toISOString().slice(0, 10);
    const bookingLookaheadEndYmd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
      turnoverJobChecklistItemsRes,
    ] = await Promise.all([
      serviceClient
        .from("properties")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      serviceClient
        .from("cleaner_accounts")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      serviceClient
        .from("turnover_jobs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      serviceClient
        .from("grounds_accounts")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      serviceClient
        .from("grounds_jobs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
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
        .limit(100),
      serviceClient
        .from("turnover_job_checklist_items")
        .select("*")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
    ]);

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
    const cleanerAccountIds = ((cleanerAccountsRes.data ?? []) as Array<{ id: string }>).map((account) => account.id);
    const groundsAccountIds = ((groundsAccountsRes.data ?? []) as Array<{ id: string }>).map((account) => account.id);
    const jobIds = ((jobsRes.data ?? []) as Array<{ id: string }>).map((job) => job.id);
    const groundsJobIds = ((groundsJobsRes.data ?? []) as Array<{ id: string }>).map((job) => job.id);

    const [
      cleanerAccountMembersRes,
      jobSlotsRes,
      groundsAccountMembersRes,
      groundsJobSlotsRes,
      strandedJobsRes,
    ] = await Promise.all([
      cleanerAccountIds.length > 0
        ? serviceClient
            .from("cleaner_account_members")
            .select("*")
            .in("cleaner_account_id", cleanerAccountIds)
            .order("created_at", { ascending: false })
        : emptyResult(),
      jobIds.length > 0
        ? serviceClient
            .from("turnover_job_slots")
            .select("*")
            .in("job_id", jobIds)
            .order("job_id", { ascending: true })
        : emptyResult(),
      groundsAccountIds.length > 0
        ? serviceClient
            .from("grounds_account_members")
            .select("*")
            .in("grounds_account_id", groundsAccountIds)
            .order("created_at", { ascending: false })
        : emptyResult(),
      groundsJobIds.length > 0
        ? serviceClient
            .from("grounds_job_slots")
            .select("*")
            .in("job_id", groundsJobIds)
            .order("job_id", { ascending: true })
        : emptyResult(),
      propertyIds.length > 0
        ? serviceClient
            .from("admin_stranded_jobs")
            .select("*")
            .in("property_id", propertyIds)
            .order("created_at", { ascending: true })
        : emptyResult(),
    ]);

    const childRequiredResponses = [
      cleanerAccountMembersRes,
      jobSlotsRes,
      groundsAccountMembersRes,
      groundsJobSlotsRes,
      strandedJobsRes,
    ];

    for (const response of childRequiredResponses) {
      if (response.error) {
        throw new Error(response.error.message);
      }
    }

    return Response.json({
      ok: true,
      data: {
        properties,
        cleanerAccounts: cleanerAccountsRes.data ?? [],
        cleanerAccountMembers: cleanerAccountMembersRes.data ?? [],
        jobs: jobsRes.data ?? [],
        jobSlots: jobSlotsRes.data ?? [],
        groundsAccounts: groundsAccountsRes.data ?? [],
        groundsAccountMembers: groundsAccountMembersRes.data ?? [],
        groundsJobs: groundsJobsRes.data ?? [],
        groundsJobSlots: groundsJobSlotsRes.data ?? [],
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
        turnoverJobChecklistItems:
          turnoverJobChecklistItemsRes.error && isOptionalTableError(turnoverJobChecklistItemsRes.error)
            ? []
            : turnoverJobChecklistItemsRes.data ?? [],
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 }
    );
  }
}
