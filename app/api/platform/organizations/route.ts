import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isMissingAuditLogTableError, writeAuditLog } from "@/lib/server/audit-log";

export const dynamic = "force-dynamic";

type PlatformAction =
  | { type: "ensure_cleaning_demo" }
  | { type: "set_ai_master"; enabled: boolean }
  | { type: "set_beta_signup"; enabled?: boolean; limit?: number | null }
  | { type: "set_ai_organization"; organizationId: string; enabled: boolean }
  | { type: "set_ai_member"; organizationId: string; memberId: string; enabled: boolean }
  | { type: "extend_trial"; organizationId: string; days?: number }
  | { type: "set_status"; organizationId: string; status: "trialing" | "active" | "past_due" | "canceled" | "suspended" }
  | { type: "set_organization_type"; organizationId: string; organizationType: "property_management" | "cleaning_company" }
  | {
      type: "set_plan";
      organizationId: string;
      accountType?: "internal" | "beta" | "customer";
      planName?: string;
      propertyLimit?: number | null;
      memberLimit?: number | null;
      billingOverrideReason?: string | null;
      status?: "trialing" | "active" | "past_due" | "canceled" | "suspended";
    }
  | { type: "delete_organization"; organizationId: string; confirmName: string };

const CLEANING_DEMO_SLUG = "cleaning-company-demo";
const CLEANING_DEMO_NAME = "Cleaning Company Demo";

type OrganizationRow = {
  id: string;
  name: string | null;
  slug: string | null;
  created_at?: string | null;
  created_by?: string | null;
  subscription_status?: string | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  billing_enabled?: boolean | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  organization_type?: "property_management" | "cleaning_company" | null;
  account_type?: string | null;
  plan_name?: string | null;
  property_limit?: number | null;
  member_limit?: number | null;
  billing_override_reason?: string | null;
  ai_copilot_enabled?: boolean | null;
};

type OrganizationMemberRow = {
  id: string;
  organization_id: string;
  profile_id: string;
  role: string | null;
  created_at?: string | null;
  ai_copilot_enabled?: boolean | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

type OrganizationLinkedRow = {
  id: string;
  organization_id: string;
};

type AuditLogRow = {
  id: string;
  created_at?: string | null;
  actor_profile_id?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  organization_id?: string | null;
  action_type: string;
  target_type?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type FeatureUsageEventRow = {
  id: string;
  created_at?: string | null;
  organization_id: string;
  portal: string;
  area: string;
  feature_key: string;
  feature_label: string;
  action: string;
};

type FeatureUsageSummary = {
  available: boolean;
  global: {
    total_events: number;
    unique_features: number;
    top_features: Array<{
      feature_key: string;
      feature_label: string;
      portal: string;
      count: number;
      last_used_at: string | null;
    }>;
  };
  byOrganization: Record<
    string,
    {
      total_events: number;
      unique_features: number;
      last_used_at: string | null;
      top_features: Array<{
        feature_key: string;
        feature_label: string;
        portal: string;
        count: number;
        last_used_at: string | null;
      }>;
    }
  >;
};

type PlatformSettingsRow = {
  id: boolean;
  ai_copilot_enabled?: boolean | null;
  beta_signup_enabled?: boolean | null;
  beta_signup_limit?: number | null;
};

function getClients(token?: string | null) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing server environment variables.");
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined,
  });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { authClient, serviceClient };
}

async function requirePlatformAdmin(token?: string | null) {
  if (!token) {
    throw new Error("Missing access token.");
  }

  const { authClient, serviceClient } = getClients(token);
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    throw new Error("Not authenticated.");
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "platform_admin") {
    throw new Error("Platform admin access required.");
  }

  return {
    user,
    profile,
    serviceClient,
  };
}

async function loadOrganizationOverview(serviceClient: ReturnType<typeof getClients>["serviceClient"]) {
  const organizationSelect =
    "id,name,slug,created_at,created_by,subscription_status,trial_started_at,trial_ends_at,billing_enabled,stripe_customer_id,stripe_subscription_id,organization_type,account_type,plan_name,property_limit,member_limit,billing_override_reason,ai_copilot_enabled";
  const [
    membersRes,
    profilesRes,
    propertiesRes,
    turnoverJobsRes,
    groundsJobsRes,
    ownerAccountsRes,
  ] = await Promise.all([
    serviceClient
      .from("organization_members")
      .select("id, organization_id, profile_id, role, created_at, ai_copilot_enabled"),
    serviceClient
      .from("profiles")
      .select("id,email,full_name,role"),
    serviceClient
      .from("properties")
      .select("id,organization_id"),
    serviceClient
      .from("turnover_jobs")
      .select("id,organization_id"),
    serviceClient
      .from("grounds_jobs")
      .select("id,organization_id"),
    serviceClient
      .from("owner_accounts")
      .select("id,organization_id"),
  ]);

  let organizationsRes = await serviceClient
    .from("organizations")
    .select(organizationSelect)
    .order("created_at", { ascending: false });

  if (organizationsRes.error?.code === "42703") {
    organizationsRes = (await serviceClient
      .from("organizations")
      .select("id,name,slug,created_at,created_by,subscription_status,trial_started_at,trial_ends_at,billing_enabled,stripe_customer_id,stripe_subscription_id")
      .order("created_at", { ascending: false })) as typeof organizationsRes;
  }

  let safeMembersRes = membersRes;
  if (safeMembersRes.error?.code === "42703") {
    safeMembersRes = await serviceClient
      .from("organization_members")
      .select("id, organization_id, profile_id, role, created_at");
  }

  const responses = [
    organizationsRes,
    safeMembersRes,
    profilesRes,
    propertiesRes,
    turnoverJobsRes,
    groundsJobsRes,
    ownerAccountsRes,
  ];

  for (const response of responses) {
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  const organizations = ((organizationsRes.data ?? []) as OrganizationRow[]).map((organization) => ({
    organization_type: "property_management",
    account_type: "beta",
    plan_name: "Beta trial",
    property_limit: 10,
    member_limit: 15,
    ai_copilot_enabled: false,
    ...organization,
  }));
  const members = ((safeMembersRes.data ?? []) as OrganizationMemberRow[]).map((member) => ({
    ai_copilot_enabled: false,
    ...member,
  }));
  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const properties = (propertiesRes.data ?? []) as OrganizationLinkedRow[];
  const turnoverJobs = (turnoverJobsRes.data ?? []) as OrganizationLinkedRow[];
  const groundsJobs = (groundsJobsRes.data ?? []) as OrganizationLinkedRow[];
  const ownerAccounts = (ownerAccountsRes.data ?? []) as OrganizationLinkedRow[];

  const profileById = new Map(
    profiles.map((profile) => [profile.id, profile])
  );

  const summaries = organizations.map((organization) => {
    const organizationMembers = members.filter((member) => member.organization_id === organization.id);
    const adminMembers = organizationMembers.filter((member) => member.role === "admin");
    const adminProfiles = adminMembers
      .map((member) => profileById.get(member.profile_id))
      .filter((profile): profile is ProfileRow => !!profile)
      .map((profile) => ({
        id: profile.id,
        membership_id: adminMembers.find((member) => member.profile_id === profile.id)?.id || "",
        full_name: profile.full_name,
        email: profile.email,
        ai_copilot_enabled: Boolean(
          adminMembers.find((member) => member.profile_id === profile.id)?.ai_copilot_enabled
        ),
      }));

    return {
      ...organization,
      member_count: organizationMembers.length,
      admin_count: adminMembers.length,
      property_count: properties.filter((property) => property.organization_id === organization.id).length,
      cleaning_job_count: turnoverJobs.filter((job) => job.organization_id === organization.id).length,
      grounds_job_count: groundsJobs.filter((job) => job.organization_id === organization.id).length,
      owner_count: ownerAccounts.filter((owner) => owner.organization_id === organization.id).length,
      admins: adminProfiles,
    };
  });

  return summaries;
}

async function loadRecentAuditLogs(serviceClient: ReturnType<typeof getClients>["serviceClient"]) {
  const { data, error } = await serviceClient
    .from("audit_logs")
    .select("id,created_at,actor_profile_id,actor_email,actor_role,organization_id,action_type,target_type,target_id,metadata")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (isMissingAuditLogTableError(error)) {
      return {
        available: false,
        entries: [] as AuditLogRow[],
      };
    }

    throw new Error(error.message);
  }

  return {
    available: true,
    entries: (data ?? []) as AuditLogRow[],
  };
}

function isMissingFeatureUsageTableError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || (error.message || "").includes("feature_usage_events");
}

function summarizeFeatureUsage(events: FeatureUsageEventRow[]): FeatureUsageSummary {
  const byOrganization: FeatureUsageSummary["byOrganization"] = {};
  const globalFeatures = new Map<
    string,
    { feature_key: string; feature_label: string; portal: string; count: number; last_used_at: string | null }
  >();

  for (const event of events) {
    const createdAt = event.created_at || null;
    const orgSummary =
      byOrganization[event.organization_id] ||
      {
        total_events: 0,
        unique_features: 0,
        last_used_at: null,
        top_features: [],
      };

    orgSummary.total_events += 1;
    if (!orgSummary.last_used_at || (createdAt && createdAt > orgSummary.last_used_at)) {
      orgSummary.last_used_at = createdAt;
    }

    const featureId = `${event.portal}:${event.feature_key}`;
    const orgFeature =
      orgSummary.top_features.find((feature) => `${feature.portal}:${feature.feature_key}` === featureId) ||
      {
        feature_key: event.feature_key,
        feature_label: event.feature_label,
        portal: event.portal,
        count: 0,
        last_used_at: null,
      };

    orgFeature.count += 1;
    if (!orgFeature.last_used_at || (createdAt && createdAt > orgFeature.last_used_at)) {
      orgFeature.last_used_at = createdAt;
    }

    if (!orgSummary.top_features.some((feature) => `${feature.portal}:${feature.feature_key}` === featureId)) {
      orgSummary.top_features.push(orgFeature);
    }

    byOrganization[event.organization_id] = orgSummary;

    const globalFeature =
      globalFeatures.get(featureId) ||
      {
        feature_key: event.feature_key,
        feature_label: event.feature_label,
        portal: event.portal,
        count: 0,
        last_used_at: null,
      };

    globalFeature.count += 1;
    if (!globalFeature.last_used_at || (createdAt && createdAt > globalFeature.last_used_at)) {
      globalFeature.last_used_at = createdAt;
    }
    globalFeatures.set(featureId, globalFeature);
  }

  for (const summary of Object.values(byOrganization)) {
    summary.unique_features = summary.top_features.length;
    summary.top_features = summary.top_features
      .sort((a, b) => b.count - a.count || String(b.last_used_at || "").localeCompare(String(a.last_used_at || "")))
      .slice(0, 5);
  }

  const topFeatures = [...globalFeatures.values()]
    .sort((a, b) => b.count - a.count || String(b.last_used_at || "").localeCompare(String(a.last_used_at || "")))
    .slice(0, 8);

  return {
    available: true,
    global: {
      total_events: events.length,
      unique_features: globalFeatures.size,
      top_features: topFeatures,
    },
    byOrganization,
  };
}

async function loadFeatureUsageSummary(serviceClient: ReturnType<typeof getClients>["serviceClient"]) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await serviceClient
    .from("feature_usage_events")
    .select("id,created_at,organization_id,portal,area,feature_key,feature_label,action")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    if (isMissingFeatureUsageTableError(error)) {
      return {
        ...summarizeFeatureUsage([]),
        available: false,
      };
    }

    throw new Error(error.message);
  }

  return summarizeFeatureUsage((data ?? []) as FeatureUsageEventRow[]);
}

function isMissingPlatformSettingsError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message || "";
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    message.includes("platform_settings") ||
    message.includes("ai_copilot_enabled") ||
    message.includes("beta_signup_enabled") ||
    message.includes("beta_signup_limit")
  );
}

async function loadPlatformSettings(serviceClient: ReturnType<typeof getClients>["serviceClient"]) {
  const signupCountQuery = async () => {
    let result = await serviceClient
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .or("account_type.is.null,account_type.neq.internal");

    if (result.error?.code === "42703") {
      result = await serviceClient
        .from("organizations")
        .select("id", { count: "exact", head: true });
    }

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.count ?? 0;
  };

  const { data, error } = await serviceClient
    .from("platform_settings")
    .select("id,ai_copilot_enabled,beta_signup_enabled,beta_signup_limit")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if (isMissingPlatformSettingsError(error)) {
      return {
        available: false,
        ai_copilot_enabled: false,
        beta_signup_enabled: true,
        beta_signup_limit: null,
        beta_signup_count: 0,
        beta_signup_remaining: null,
      };
    }

    throw new Error(error.message);
  }

  const row = data as PlatformSettingsRow | null;
  const betaSignupCount = await signupCountQuery();
  const betaSignupLimit =
    row?.beta_signup_limit === null || row?.beta_signup_limit === undefined
      ? null
      : Number.isFinite(Number(row.beta_signup_limit))
        ? Number(row.beta_signup_limit)
        : null;

  return {
    available: true,
    ai_copilot_enabled: Boolean(row?.ai_copilot_enabled),
    beta_signup_enabled: row?.beta_signup_enabled !== false,
    beta_signup_limit: betaSignupLimit,
    beta_signup_count: betaSignupCount,
    beta_signup_remaining:
      typeof betaSignupLimit === "number"
        ? Math.max(betaSignupLimit - betaSignupCount, 0)
        : null,
  };
}

async function deleteRowsByOrganization(
  serviceClient: ReturnType<typeof getClients>["serviceClient"],
  table: string,
  organizationId: string
) {
  const { count, error } = await serviceClient
    .from(table)
    .delete({ count: "exact" })
    .eq("organization_id", organizationId);

  if (error) {
    if (error.code === "42P01" || error.code === "42703") return 0;
    throw new Error(`${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function deleteRowsByIds(
  serviceClient: ReturnType<typeof getClients>["serviceClient"],
  table: string,
  column: string,
  ids: string[]
) {
  if (ids.length === 0) return 0;

  const { count, error } = await serviceClient
    .from(table)
    .delete({ count: "exact" })
    .in(column, ids);

  if (error) {
    if (error.code === "42P01" || error.code === "42703") return 0;
    throw new Error(`${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function loadIdsByOrganization(
  serviceClient: ReturnType<typeof getClients>["serviceClient"],
  table: string,
  organizationId: string
) {
  const { data, error } = await serviceClient
    .from(table)
    .select("id")
    .eq("organization_id", organizationId);

  if (error) {
    if (error.code === "42P01" || error.code === "42703") return [];
    throw new Error(`${table}: ${error.message}`);
  }

  return (data ?? []).map((row: { id: string }) => row.id);
}

async function loadIdsByColumn(
  serviceClient: ReturnType<typeof getClients>["serviceClient"],
  table: string,
  column: string,
  ids: string[]
) {
  if (ids.length === 0) return [];

  const { data, error } = await serviceClient
    .from(table)
    .select("id")
    .in(column, ids);

  if (error) {
    if (error.code === "42P01" || error.code === "42703") return [];
    throw new Error(`${table}: ${error.message}`);
  }

  return (data ?? []).map((row: { id: string }) => row.id);
}

async function deleteOrganizationWorkspace(
  serviceClient: ReturnType<typeof getClients>["serviceClient"],
  organizationId: string
) {
  const propertyIds = await loadIdsByOrganization(serviceClient, "properties", organizationId);
  const turnoverJobIds = await loadIdsByOrganization(serviceClient, "turnover_jobs", organizationId);
  const groundsJobIds = await loadIdsByOrganization(serviceClient, "grounds_jobs", organizationId);
  const maintenanceFlagIds = await loadIdsByOrganization(serviceClient, "property_maintenance_flags", organizationId);
  const cleanerAccountIds = await loadIdsByOrganization(serviceClient, "cleaner_accounts", organizationId);
  const groundsAccountIds = await loadIdsByOrganization(serviceClient, "grounds_accounts", organizationId);
  const ownerAccountIds = await loadIdsByOrganization(serviceClient, "owner_accounts", organizationId);
  const ownerInvoiceIds = await loadIdsByOrganization(serviceClient, "owner_invoices", organizationId);
  const sopIds = await loadIdsByColumn(serviceClient, "property_sops", "property_id", propertyIds);

  let deleted = 0;
  const summary: Record<string, number> = {};
  const track = async (table: string, action: Promise<number>) => {
    const count = await action;
    summary[table] = count;
    deleted += count;
  };

  await track("chat_hidden_items", deleteRowsByOrganization(serviceClient, "chat_hidden_items", organizationId));
  await track("chat_messages", deleteRowsByOrganization(serviceClient, "chat_messages", organizationId));
  await track("chat_participants", deleteRowsByOrganization(serviceClient, "chat_participants", organizationId));
  await track("chat_conversations", deleteRowsByOrganization(serviceClient, "chat_conversations", organizationId));
  await track("owner_invoice_events", deleteRowsByIds(serviceClient, "owner_invoice_events", "invoice_id", ownerInvoiceIds));
  await track("owner_invoice_hidden_items", deleteRowsByIds(serviceClient, "owner_invoice_hidden_items", "invoice_id", ownerInvoiceIds));
  await track("owner_invoices", deleteRowsByOrganization(serviceClient, "owner_invoices", organizationId));
  await track("property_invoice_rates", deleteRowsByOrganization(serviceClient, "property_invoice_rates", organizationId));
  await track("organization_invoice_settings", deleteRowsByOrganization(serviceClient, "organization_invoice_settings", organizationId));
  await track("feature_usage_events", deleteRowsByOrganization(serviceClient, "feature_usage_events", organizationId));
  await track("document_vault_files", deleteRowsByOrganization(serviceClient, "document_vault_files", organizationId));
  await track("property_maintenance_flag_images", deleteRowsByIds(serviceClient, "property_maintenance_flag_images", "flag_id", maintenanceFlagIds));
  await track("property_maintenance_flags", deleteRowsByOrganization(serviceClient, "property_maintenance_flags", organizationId));
  await track("property_inspection_photos", deleteRowsByOrganization(serviceClient, "property_inspection_photos", organizationId));
  await track("property_inspection_logs", deleteRowsByOrganization(serviceClient, "property_inspection_logs", organizationId));
  await track("property_inspection_rules", deleteRowsByOrganization(serviceClient, "property_inspection_rules", organizationId));
  await track("property_calendars", deleteRowsByIds(serviceClient, "property_calendars", "property_id", propertyIds));
  await track("property_booking_events", deleteRowsByOrganization(serviceClient, "property_booking_events", organizationId));
  await track("turnover_job_slots", deleteRowsByIds(serviceClient, "turnover_job_slots", "job_id", turnoverJobIds));
  await track("grounds_job_slots", deleteRowsByIds(serviceClient, "grounds_job_slots", "job_id", groundsJobIds));
  await track("turnover_jobs", deleteRowsByOrganization(serviceClient, "turnover_jobs", organizationId));
  await track("grounds_jobs", deleteRowsByOrganization(serviceClient, "grounds_jobs", organizationId));
  await track("property_access", deleteRowsByIds(serviceClient, "property_access", "property_id", propertyIds));
  await track("property_cleaner_account_assignments", deleteRowsByIds(serviceClient, "property_cleaner_account_assignments", "property_id", propertyIds));
  await track("property_grounds_account_assignments", deleteRowsByIds(serviceClient, "property_grounds_account_assignments", "property_id", propertyIds));
  await track("property_grounds_recurring_tasks", deleteRowsByIds(serviceClient, "property_grounds_recurring_tasks", "property_id", propertyIds));
  await track("property_grounds_recurring_rules", deleteRowsByIds(serviceClient, "property_grounds_recurring_rules", "property_id", propertyIds));
  await track("property_sop_images", deleteRowsByIds(serviceClient, "property_sop_images", "sop_id", sopIds));
  await track("property_sops", deleteRowsByIds(serviceClient, "property_sops", "property_id", propertyIds));
  await track("owner_property_access_by_property", deleteRowsByIds(serviceClient, "owner_property_access", "property_id", propertyIds));
  await track("owner_property_access_by_owner", deleteRowsByIds(serviceClient, "owner_property_access", "owner_account_id", ownerAccountIds));
  await track("owner_accounts", deleteRowsByOrganization(serviceClient, "owner_accounts", organizationId));
  await track("cleaner_account_members", deleteRowsByIds(serviceClient, "cleaner_account_members", "cleaner_account_id", cleanerAccountIds));
  await track("grounds_account_members", deleteRowsByIds(serviceClient, "grounds_account_members", "grounds_account_id", groundsAccountIds));
  await track("cleaner_accounts", deleteRowsByOrganization(serviceClient, "cleaner_accounts", organizationId));
  await track("grounds_accounts", deleteRowsByOrganization(serviceClient, "grounds_accounts", organizationId));
  await track("organization_invites", deleteRowsByOrganization(serviceClient, "organization_invites", organizationId));
  await track("support_tickets", deleteRowsByOrganization(serviceClient, "support_tickets", organizationId));
  await track("support_requests", deleteRowsByOrganization(serviceClient, "support_requests", organizationId));
  await track("properties", deleteRowsByOrganization(serviceClient, "properties", organizationId));
  await track("organization_members", deleteRowsByOrganization(serviceClient, "organization_members", organizationId));

  const { count: organizationCount, error: organizationDeleteError } = await serviceClient
    .from("organizations")
    .delete({ count: "exact" })
    .eq("id", organizationId);

  if (organizationDeleteError) {
    throw new Error(`organizations: ${organizationDeleteError.message}`);
  }

  summary.organizations = organizationCount ?? 0;
  return { deletedRows: deleted + (organizationCount ?? 0), summary };
}

async function ensureCleaningCompanyDemo(
  serviceClient: ReturnType<typeof getClients>["serviceClient"],
  platformProfileId: string
) {
  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);

  const { data: existingOrganization, error: existingOrganizationError } = await serviceClient
    .from("organizations")
    .select("id,name,slug")
    .eq("slug", CLEANING_DEMO_SLUG)
    .maybeSingle();

  if (existingOrganizationError) {
    throw new Error(existingOrganizationError.message);
  }

  let organization = existingOrganization as { id: string; name: string | null; slug: string | null } | null;

  if (!organization) {
    const { data: insertedOrganization, error: insertOrganizationError } = await serviceClient
      .from("organizations")
      .insert({
        name: CLEANING_DEMO_NAME,
        slug: CLEANING_DEMO_SLUG,
        created_by: platformProfileId,
        subscription_status: "active",
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        billing_enabled: false,
        organization_type: "cleaning_company",
        account_type: "internal",
        plan_name: "Cleaning company demo",
        property_limit: 25,
        member_limit: 50,
        billing_override_reason: "SaaS tower cleaning-company viewer",
      })
      .select("id,name,slug")
      .single();

    if (insertOrganizationError || !insertedOrganization) {
      throw new Error(insertOrganizationError?.message || "Could not create cleaning company demo organization.");
    }

    organization = insertedOrganization as { id: string; name: string | null; slug: string | null };
  } else {
    const { error: updateOrganizationError } = await serviceClient
      .from("organizations")
      .update({
        name: CLEANING_DEMO_NAME,
        organization_type: "cleaning_company",
        account_type: "internal",
        plan_name: "Cleaning company demo",
        billing_enabled: false,
        subscription_status: "active",
        billing_override_reason: "SaaS tower cleaning-company viewer",
      })
      .eq("id", organization.id);

    if (updateOrganizationError) {
      throw new Error(updateOrganizationError.message);
    }
  }

  const { data: existingMembership, error: membershipLookupError } = await serviceClient
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organization.id)
    .eq("profile_id", platformProfileId)
    .maybeSingle();

  if (membershipLookupError) {
    throw new Error(membershipLookupError.message);
  }

  if (!existingMembership) {
    const { error: membershipInsertError } = await serviceClient.from("organization_members").insert({
      organization_id: organization.id,
      profile_id: platformProfileId,
      role: "admin",
    });

    if (membershipInsertError) {
      throw new Error(membershipInsertError.message);
    }
  }

  const { data: existingProperty, error: propertyLookupError } = await serviceClient
    .from("properties")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("name", "Demo Lakehouse Turnover")
    .maybeSingle();

  if (propertyLookupError) {
    throw new Error(propertyLookupError.message);
  }

  let propertyId = existingProperty?.id as string | undefined;

  if (!propertyId) {
    const { data: insertedProperty, error: propertyInsertError } = await serviceClient
      .from("properties")
      .insert({
        organization_id: organization.id,
        name: "Demo Lakehouse Turnover",
        address: "100 Demo Lane, Collingwood, ON",
        notes: "Cleaning-company demo property for SaaS Tower previews.",
        latitude: 44.5008,
        longitude: -80.2169,
      })
      .select("id")
      .single();

    if (propertyInsertError || !insertedProperty) {
      throw new Error(propertyInsertError?.message || "Could not create demo property.");
    }

    propertyId = insertedProperty.id as string;
  }

  const { data: existingAccess, error: accessLookupError } = await serviceClient
    .from("property_access")
    .select("id")
    .eq("property_id", propertyId)
    .maybeSingle();

  if (accessLookupError) {
    throw new Error(accessLookupError.message);
  }

  if (!existingAccess) {
    const { error: accessInsertError } = await serviceClient.from("property_access").insert({
      property_id: propertyId,
      door_code: "2468",
      alarm_code: "1357",
      notes: "Demo lockbox on front rail. Return key and scramble code after entry.",
    });

    if (accessInsertError) {
      throw new Error(accessInsertError.message);
    }
  }

  const { data: existingCleaner, error: cleanerLookupError } = await serviceClient
    .from("cleaner_accounts")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("email", "cleaner-demo@guleraos.local")
    .maybeSingle();

  if (cleanerLookupError) {
    throw new Error(cleanerLookupError.message);
  }

  let cleanerAccountId = existingCleaner?.id as string | undefined;

  if (!cleanerAccountId) {
    const { data: insertedCleaner, error: cleanerInsertError } = await serviceClient
      .from("cleaner_accounts")
      .insert({
        organization_id: organization.id,
        display_name: "Demo Cleaning Team",
        email: "cleaner-demo@guleraos.local",
        phone: "555-0101",
        active: true,
      })
      .select("id")
      .single();

    if (cleanerInsertError || !insertedCleaner) {
      throw new Error(cleanerInsertError?.message || "Could not create demo cleaner account.");
    }

    cleanerAccountId = insertedCleaner.id as string;
  }

  const { data: existingAssignment, error: assignmentLookupError } = await serviceClient
    .from("property_cleaner_account_assignments")
    .select("id")
    .eq("property_id", propertyId)
    .eq("cleaner_account_id", cleanerAccountId)
    .maybeSingle();

  if (assignmentLookupError) {
    throw new Error(assignmentLookupError.message);
  }

  if (!existingAssignment) {
    const { error: assignmentInsertError } = await serviceClient.from("property_cleaner_account_assignments").insert({
      property_id: propertyId,
      cleaner_account_id: cleanerAccountId,
      priority: 1,
    });

    if (assignmentInsertError) {
      throw new Error(assignmentInsertError.message);
    }
  }

  const { data: existingSop, error: sopLookupError } = await serviceClient
    .from("property_sops")
    .select("id")
    .eq("property_id", propertyId)
    .eq("title", "Demo turnover SOP")
    .maybeSingle();

  if (sopLookupError) {
    throw new Error(sopLookupError.message);
  }

  if (!existingSop) {
    const { error: sopInsertError } = await serviceClient.from("property_sops").insert({
      property_id: propertyId,
      title: "Demo turnover SOP",
      content: "Check entry photos, restock guest supplies, complete checklist, report damage with photos, and confirm lockbox is secure.",
    });

    if (sopInsertError) {
      throw new Error(sopInsertError.message);
    }
  }

  const { data: checklistItems, error: checklistLookupError } = await serviceClient
    .from("property_cleaning_checklist_items")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("property_id", propertyId)
    .limit(1);

  if (checklistLookupError) {
    throw new Error(checklistLookupError.message);
  }

  if ((checklistItems ?? []).length === 0) {
    const { error: checklistInsertError } = await serviceClient.from("property_cleaning_checklist_items").insert([
      {
        organization_id: organization.id,
        property_id: propertyId,
        title: "Clean bathrooms",
        description: "Toilets, sinks, mirrors, tubs, floors, and guest supplies.",
        sort_order: 10,
        active: true,
      },
      {
        organization_id: organization.id,
        property_id: propertyId,
        title: "Reset kitchen",
        description: "Sink, counters, fridge check, dishes, garbage, and starter supplies.",
        sort_order: 20,
        active: true,
      },
      {
        organization_id: organization.id,
        property_id: propertyId,
        title: "Final walkthrough",
        description: "Thermostat, lights, lockbox, damages, and guest-ready photos.",
        sort_order: 30,
        active: true,
      },
    ]);

    if (checklistInsertError) {
      throw new Error(checklistInsertError.message);
    }
  }

  const { data: existingJob, error: jobLookupError } = await serviceClient
    .from("turnover_jobs")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("property_id", propertyId)
    .ilike("notes", "%[DEMO:CLEANING-COMPANY]%")
    .maybeSingle();

  if (jobLookupError) {
    throw new Error(jobLookupError.message);
  }

  let jobId = existingJob?.id as string | undefined;

  if (!jobId) {
    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + 1);

    const { data: insertedJob, error: jobInsertError } = await serviceClient
      .from("turnover_jobs")
      .insert({
        organization_id: organization.id,
        property_id: propertyId,
        status: "accepted",
        notes:
          "Guest / reservation: Demo guest\nCheckout date: " +
          scheduledFor.toISOString().slice(0, 10) +
          "\n[DEMO:CLEANING-COMPANY]",
        scheduled_for: scheduledFor.toISOString().slice(0, 10),
        cleaners_needed: 1,
        cleaners_required_strict: false,
        cleaner_units_needed: 1,
        cleaner_units_required_strict: false,
        show_team_status_to_cleaners: true,
      })
      .select("id")
      .single();

    if (jobInsertError || !insertedJob) {
      throw new Error(jobInsertError?.message || "Could not create demo turnover job.");
    }

    jobId = insertedJob.id as string;
  }

  const { data: existingSlot, error: slotLookupError } = await serviceClient
    .from("turnover_job_slots")
    .select("id")
    .eq("job_id", jobId)
    .eq("slot_number", 1)
    .maybeSingle();

  if (slotLookupError) {
    throw new Error(slotLookupError.message);
  }

  if (!existingSlot) {
    const { error: slotInsertError } = await serviceClient.from("turnover_job_slots").insert({
      job_id: jobId,
      slot_number: 1,
      cleaner_account_id: cleanerAccountId,
      status: "accepted",
      offered_at: now.toISOString(),
      accepted_at: now.toISOString(),
    });

    if (slotInsertError) {
      throw new Error(slotInsertError.message);
    }
  }

  return organization;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const { profile, serviceClient } = await requirePlatformAdmin(token);
    const organizations = await loadOrganizationOverview(serviceClient);
    const auditLogState = await loadRecentAuditLogs(serviceClient);
    const featureUsage = await loadFeatureUsageSummary(serviceClient);
    const platformSettings = await loadPlatformSettings(serviceClient);

    return NextResponse.json({
      ok: true,
      currentProfile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
      },
      organizations,
      auditLogs: auditLogState.entries,
      auditLogAvailable: auditLogState.available,
      featureUsage,
      platformSettings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const status =
      message === "Missing access token." || message === "Not authenticated."
        ? 401
        : message === "Platform admin access required."
          ? 403
          : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const { profile, serviceClient } = await requirePlatformAdmin(token);
    const body = (await req.json().catch(() => null)) as PlatformAction | null;
    let previewOrganizationId: string | null = null;

    if (!body?.type) {
      return NextResponse.json({ ok: false, error: "Missing platform action." }, { status: 400 });
    }

    if (body.type === "ensure_cleaning_demo") {
      const demoOrganization = await ensureCleaningCompanyDemo(serviceClient, profile.id);
      previewOrganizationId = demoOrganization.id;

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId: demoOrganization.id,
        actionType: "platform.ensure_cleaning_demo",
        targetType: "organization",
        targetId: demoOrganization.id,
        metadata: {
          slug: CLEANING_DEMO_SLUG,
          organization_type: "cleaning_company",
        },
      });
    } else if (body.type === "set_ai_master") {
      const { error: upsertError } = await serviceClient
        .from("platform_settings")
        .upsert({
          id: true,
          ai_copilot_enabled: body.enabled,
          updated_at: new Date().toISOString(),
        });

      if (upsertError) {
        return NextResponse.json(
          {
            ok: false,
            error: isMissingPlatformSettingsError(upsertError)
              ? "AI copilot controls are missing. Run supabase/add_ai_copilot_controls.sql in Supabase first."
              : upsertError.message,
          },
          { status: 500 }
        );
      }

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId: null,
        actionType: "platform.set_ai_master",
        targetType: "platform_settings",
        targetId: "platform_settings:true",
        metadata: {
          ai_copilot_enabled: body.enabled,
        },
      });
    } else if (body.type === "set_beta_signup") {
      const updates: Record<string, unknown> = {
        id: true,
        updated_at: new Date().toISOString(),
      };

      if (typeof body.enabled === "boolean") {
        updates.beta_signup_enabled = body.enabled;
      }

      if (body.limit !== undefined) {
        const nextLimit = body.limit === null ? null : Number(body.limit);
        updates.beta_signup_limit =
          nextLimit === null || (Number.isFinite(nextLimit) && nextLimit >= 0) ? nextLimit : 10;
      }

      const { error: upsertError } = await serviceClient
        .from("platform_settings")
        .upsert(updates);

      if (upsertError) {
        return NextResponse.json(
          {
            ok: false,
            error: isMissingPlatformSettingsError(upsertError)
              ? "Beta signup controls are missing. Run supabase/add_beta_signup_controls.sql in Supabase first."
              : upsertError.message,
          },
          { status: 500 }
        );
      }

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId: null,
        actionType: "platform.set_beta_signup",
        targetType: "platform_settings",
        targetId: "platform_settings:true",
        metadata: updates,
      });
    } else if (!body.organizationId) {
      return NextResponse.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    } else if (body.type === "set_ai_organization") {
      const { error: updateError } = await serviceClient
        .from("organizations")
        .update({
          ai_copilot_enabled: body.enabled,
        })
        .eq("id", body.organizationId);

      if (updateError) {
        return NextResponse.json(
          {
            ok: false,
            error: isMissingPlatformSettingsError(updateError)
              ? "AI copilot controls are missing. Run supabase/add_ai_copilot_controls.sql in Supabase first."
              : updateError.message,
          },
          { status: 500 }
        );
      }

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId: body.organizationId,
        actionType: "platform.set_ai_organization",
        targetType: "organization",
        targetId: body.organizationId,
        metadata: {
          ai_copilot_enabled: body.enabled,
        },
      });
    } else if (body.type === "set_ai_member") {
      const { data: membership, error: membershipError } = await serviceClient
        .from("organization_members")
        .select("id, organization_id, profile_id, role")
        .eq("id", body.memberId)
        .eq("organization_id", body.organizationId)
        .maybeSingle();

      if (membershipError) {
        return NextResponse.json({ ok: false, error: membershipError.message }, { status: 500 });
      }

      if (!membership) {
        return NextResponse.json({ ok: false, error: "Organization member not found." }, { status: 404 });
      }

      if (membership.role !== "admin") {
        return NextResponse.json({ ok: false, error: "Only admin members can receive copilot access." }, { status: 400 });
      }

      const { error: updateError } = await serviceClient
        .from("organization_members")
        .update({
          ai_copilot_enabled: body.enabled,
        })
        .eq("id", body.memberId)
        .eq("organization_id", body.organizationId);

      if (updateError) {
        return NextResponse.json(
          {
            ok: false,
            error: isMissingPlatformSettingsError(updateError)
              ? "AI copilot controls are missing. Run supabase/add_ai_copilot_controls.sql in Supabase first."
              : updateError.message,
          },
          { status: 500 }
        );
      }

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId: body.organizationId,
        actionType: "platform.set_ai_member",
        targetType: "organization_member",
        targetId: body.memberId,
        metadata: {
          profile_id: membership.profile_id,
          ai_copilot_enabled: body.enabled,
        },
      });
    } else if (body.type === "extend_trial") {
      const extraDays = Number(body.days || 30);
      const { data: organization, error: orgError } = await serviceClient
        .from("organizations")
        .select("id, trial_ends_at")
        .eq("id", body.organizationId)
        .single();

      if (orgError || !organization) {
        return NextResponse.json({ ok: false, error: orgError?.message || "Organization not found." }, { status: 404 });
      }

      const currentOrganization = organization as { id: string; trial_ends_at?: string | null };
      const baseDate = currentOrganization.trial_ends_at ? new Date(currentOrganization.trial_ends_at) : new Date();
      const nextDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
      nextDate.setDate(nextDate.getDate() + extraDays);

      const { error: updateError } = await serviceClient
        .from("organizations")
        .update({
          subscription_status: "trialing",
          trial_ends_at: nextDate.toISOString(),
        })
        .eq("id", body.organizationId);

      if (updateError) {
        return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
      }

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId: body.organizationId,
        actionType: "platform.extend_trial",
        targetType: "organization",
        targetId: body.organizationId,
        metadata: {
          days: extraDays,
          trial_ends_at: nextDate.toISOString(),
        },
      });
    } else if (body.type === "set_status") {
      const { error: updateError } = await serviceClient
        .from("organizations")
        .update({
          subscription_status: body.status,
        })
        .eq("id", body.organizationId);

      if (updateError) {
        return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
      }

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId: body.organizationId,
        actionType: "platform.set_status",
        targetType: "organization",
        targetId: body.organizationId,
        metadata: {
          status: body.status,
        },
      });
    } else if (body.type === "set_organization_type") {
      const { error: updateError } = await serviceClient
        .from("organizations")
        .update({
          organization_type: body.organizationType,
        })
        .eq("id", body.organizationId);

      if (updateError) {
        return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
      }

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId: body.organizationId,
        actionType: "platform.set_organization_type",
        targetType: "organization",
        targetId: body.organizationId,
        metadata: {
          organization_type: body.organizationType,
        },
      });
    } else if (body.type === "set_plan") {
      const updates: Record<string, unknown> = {};

      if (body.accountType) updates.account_type = body.accountType;
      if (typeof body.planName === "string") updates.plan_name = body.planName.trim() || "Beta trial";
      if (body.propertyLimit !== undefined) {
        const value = body.propertyLimit === null ? null : Number(body.propertyLimit);
        updates.property_limit = value === null || (Number.isFinite(value) && value >= 0) ? value : 10;
      }
      if (body.memberLimit !== undefined) {
        const value = body.memberLimit === null ? null : Number(body.memberLimit);
        updates.member_limit = value === null || (Number.isFinite(value) && value >= 0) ? value : 15;
      }
      if (body.billingOverrideReason !== undefined) {
        const reason = String(body.billingOverrideReason || "").trim();
        updates.billing_override_reason = reason || null;
      }
      if (body.status) updates.subscription_status = body.status;
      if (body.accountType === "internal") {
        updates.subscription_status = body.status || "active";
        updates.property_limit = null;
        updates.member_limit = null;
        updates.plan_name = body.planName?.trim() || "Internal workspace";
      }

      const { error: updateError } = await serviceClient
        .from("organizations")
        .update(updates)
        .eq("id", body.organizationId);

      if (updateError) {
        return NextResponse.json(
          {
            ok: false,
            error:
              updateError.code === "42703"
                ? "SaaS plan fields are missing. Run supabase/add_saas_plan_controls.sql in Supabase first."
                : updateError.message,
          },
          { status: 500 }
        );
      }

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId: body.organizationId,
        actionType: "platform.set_plan",
        targetType: "organization",
        targetId: body.organizationId,
        metadata: updates,
      });
    } else if (body.type === "delete_organization") {
      const { data: organization, error: orgError } = await serviceClient
        .from("organizations")
        .select("id,name,slug")
        .eq("id", body.organizationId)
        .single();

      if (orgError || !organization) {
        return NextResponse.json({ ok: false, error: orgError?.message || "Organization not found." }, { status: 404 });
      }

      const expectedName = String(organization.name || organization.slug || organization.id).trim();
      const confirmedName = String(body.confirmName || "").trim();

      if (!confirmedName || confirmedName !== expectedName) {
        return NextResponse.json(
          { ok: false, error: `Type "${expectedName}" to confirm this deletion.` },
          { status: 400 }
        );
      }

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId: body.organizationId,
        actionType: "platform.delete_organization_requested",
        targetType: "organization",
        targetId: body.organizationId,
        metadata: {
          name: organization.name,
          slug: organization.slug,
        },
      });

      const deletion = await deleteOrganizationWorkspace(serviceClient, body.organizationId);

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId: null,
        actionType: "platform.delete_organization_completed",
        targetType: "organization",
        targetId: body.organizationId,
        metadata: {
          name: organization.name,
          slug: organization.slug,
          deleted_rows: deletion.deletedRows,
          summary: deletion.summary,
        },
      });
    } else {
      return NextResponse.json({ ok: false, error: "Unsupported platform action." }, { status: 400 });
    }

    const organizations = await loadOrganizationOverview(serviceClient);
    const auditLogState = await loadRecentAuditLogs(serviceClient);
    const featureUsage = await loadFeatureUsageSummary(serviceClient);
    const platformSettings = await loadPlatformSettings(serviceClient);
    return NextResponse.json({
      ok: true,
      previewOrganizationId,
      organizations,
      auditLogs: auditLogState.entries,
      auditLogAvailable: auditLogState.available,
      featureUsage,
      platformSettings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const status =
      message === "Missing access token." || message === "Not authenticated."
        ? 401
        : message === "Platform admin access required."
          ? 403
          : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
