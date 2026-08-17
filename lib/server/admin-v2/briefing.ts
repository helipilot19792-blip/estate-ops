import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  buildAdminV2Briefing,
  type AdminV2BookingRow,
  type AdminV2Briefing,
  type AdminV2InspectionRow,
  type AdminV2MaintenanceRow,
  type AdminV2PropertyCalendarRow,
  type AdminV2PropertyRow,
  type AdminV2PropertySignalRow,
  type AdminV2TeamMemberRow,
  type AdminV2TurnoverRow,
  type AdminV2TurnoverSlotRow,
} from "@/lib/admin-v2/briefing";
import { getAdminV2Access } from "@/lib/server/admin-v2/access";
import { assertWorkspaceBillingAccess } from "@/lib/server/workspace-billing-status";

type QueryResult<T> = {
  data: T[] | null;
  error: { code?: string | null; message?: string | null } | null;
};

type OrganizationBillingRow = {
  subscription_status: string | null;
  trial_ends_at: string | null;
  account_type: string | null;
  plan_name: string | null;
};

export class AdminV2BriefingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AdminV2BriefingError";
  }
}

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new AdminV2BriefingError("V2 briefing data is not configured.", 500);
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function addDaysYmd(ymd: string, days: number) {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isOptionalTableError(error: QueryResult<unknown>["error"]) {
  const message = error?.message || "";
  return error?.code === "PGRST205"
    || message.includes("Could not find the table")
    || message.includes("does not exist");
}

function rowsOrThrow<T>(result: QueryResult<T>, label: string, optional = false) {
  if (result.error) {
    if (optional && isOptionalTableError(result.error)) return [];
    throw new AdminV2BriefingError(`${label} could not be loaded.`, 500);
  }

  return result.data || [];
}

function emptyRows<T>(): Promise<QueryResult<T>> {
  return Promise.resolve({ data: [], error: null });
}

export async function getAdminV2Briefing(
  token: string,
  organizationId: string,
  now = new Date(),
): Promise<AdminV2Briefing> {
  if (!organizationId) {
    throw new AdminV2BriefingError("Choose an organization before loading the briefing.", 400);
  }

  const access = await getAdminV2Access(token);
  const organization = access.organizations.find((item) => item.id === organizationId);
  if (!organization) {
    throw new AdminV2BriefingError("You do not have access to this organization.", 403);
  }

  const serviceClient = createServiceClient();
  const { data: billingData, error: billingError } = await serviceClient
    .from("organizations")
    .select("subscription_status,trial_ends_at,account_type,plan_name")
    .eq("id", organizationId)
    .maybeSingle();

  const billing = billingData as OrganizationBillingRow | null;
  if (billingError || !billing) {
    throw new AdminV2BriefingError("The selected organization could not be verified.", 403);
  }

  try {
    assertWorkspaceBillingAccess(billing);
  } catch {
    throw new AdminV2BriefingError("This workspace is not currently available.", 403);
  }

  const generatedAt = now.toISOString();
  const todayYmd = generatedAt.slice(0, 10);
  const windowEndYmd = addDaysYmd(todayYmd, 14);

  const [
    propertiesResult,
    jobsResult,
    bookingsResult,
    maintenanceResult,
    inspectionsResult,
    teamResult,
  ] = await Promise.all([
    serviceClient
      .from("properties")
      .select("id,name,address")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    serviceClient
      .from("turnover_jobs")
      .select("id,property_id,scheduled_for,status,staffing_status,cleaner_units_needed,schedule_conflict_at,schedule_conflict_reason")
      .eq("organization_id", organizationId)
      .gte("scheduled_for", todayYmd)
      .lte("scheduled_for", windowEndYmd)
      .order("scheduled_for", { ascending: true })
      .limit(300),
    serviceClient
      .from("property_booking_events")
      .select("id,property_id,checkin_date,checkout_date,guest_count")
      .eq("organization_id", organizationId)
      .lte("checkin_date", windowEndYmd)
      .gte("checkout_date", todayYmd)
      .order("checkin_date", { ascending: true })
      .limit(300),
    serviceClient
      .from("property_maintenance_flags")
      .select("id,property_id,category,urgency,status,flagged_at,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(200),
    serviceClient
      .from("property_inspection_rules")
      .select("id,property_id,title,next_due_date,active")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("next_due_date", { ascending: true })
      .limit(200),
    serviceClient
      .from("organization_members")
      .select("profile_id,role")
      .eq("organization_id", organizationId)
      .limit(500),
  ]);

  const properties = rowsOrThrow(
    propertiesResult as QueryResult<AdminV2PropertyRow>,
    "Properties",
  );
  const jobs = rowsOrThrow(
    jobsResult as QueryResult<AdminV2TurnoverRow>,
    "Turnovers",
  );
  const bookings = rowsOrThrow(
    bookingsResult as QueryResult<AdminV2BookingRow>,
    "Booking timeline",
    true,
  );
  const maintenance = rowsOrThrow(
    maintenanceResult as QueryResult<AdminV2MaintenanceRow>,
    "Maintenance signals",
    true,
  );
  const inspections = rowsOrThrow(
    inspectionsResult as QueryResult<AdminV2InspectionRow>,
    "Inspection signals",
    true,
  );
  const teamMembers = rowsOrThrow(
    teamResult as QueryResult<AdminV2TeamMemberRow>,
    "Team summary",
  );
  const propertyIds = properties.map((property) => property.id);
  const jobIds = jobs.map((job) => job.id);

  const [slotsResult, accessResult, calendarsResult, sopsResult, checklistResult, knowledgeResult] = await Promise.all([
    jobIds.length
      ? serviceClient
          .from("turnover_job_slots")
          .select("id,job_id,cleaner_account_id,status,expires_at")
          .in("job_id", jobIds)
          .limit(1000)
      : emptyRows<AdminV2TurnoverSlotRow>(),
    propertyIds.length
      ? serviceClient.from("property_access").select("property_id").in("property_id", propertyIds)
      : emptyRows<AdminV2PropertySignalRow>(),
    propertyIds.length
      ? serviceClient.from("property_calendars").select("property_id,is_active").in("property_id", propertyIds)
      : emptyRows<AdminV2PropertyCalendarRow>(),
    propertyIds.length
      ? serviceClient.from("property_sops").select("property_id").in("property_id", propertyIds)
      : emptyRows<AdminV2PropertySignalRow>(),
    propertyIds.length
      ? serviceClient
          .from("property_cleaning_checklist_items")
          .select("property_id")
          .eq("organization_id", organizationId)
          .eq("active", true)
          .in("property_id", propertyIds)
      : emptyRows<AdminV2PropertySignalRow>(),
    propertyIds.length
      ? serviceClient
          .from("property_knowledge")
          .select("property_id")
          .eq("organization_id", organizationId)
          .in("property_id", propertyIds)
      : emptyRows<AdminV2PropertySignalRow>(),
  ]);

  return buildAdminV2Briefing({
    organization: { id: organization.id, name: organization.name },
    generatedAt,
    todayYmd,
    windowEndYmd,
    properties,
    jobs,
    slots: rowsOrThrow(slotsResult as QueryResult<AdminV2TurnoverSlotRow>, "Turnover coverage"),
    bookings,
    maintenance,
    inspections,
    accessRows: rowsOrThrow(accessResult as QueryResult<AdminV2PropertySignalRow>, "Property access signals"),
    calendars: rowsOrThrow(calendarsResult as QueryResult<AdminV2PropertyCalendarRow>, "Calendar signals"),
    sops: rowsOrThrow(sopsResult as QueryResult<AdminV2PropertySignalRow>, "Operating standards"),
    checklistItems: rowsOrThrow(
      checklistResult as QueryResult<AdminV2PropertySignalRow>,
      "Turnover standards",
      true,
    ),
    knowledgeRows: rowsOrThrow(
      knowledgeResult as QueryResult<AdminV2PropertySignalRow>,
      "Property guides",
      true,
    ),
    teamMembers,
  });
}
