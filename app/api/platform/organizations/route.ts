import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isMissingAuditLogTableError, writeAuditLog } from "@/lib/server/audit-log";

export const dynamic = "force-dynamic";

type PlatformAction =
  | { type: "extend_trial"; organizationId: string; days?: number }
  | { type: "set_status"; organizationId: string; status: "trialing" | "active" | "past_due" | "canceled" | "suspended" }
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
  account_type?: string | null;
  plan_name?: string | null;
  property_limit?: number | null;
  member_limit?: number | null;
  billing_override_reason?: string | null;
};

type OrganizationMemberRow = {
  organization_id: string;
  profile_id: string;
  role: string | null;
  created_at?: string | null;
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
    "id,name,slug,created_at,created_by,subscription_status,trial_started_at,trial_ends_at,billing_enabled,stripe_customer_id,stripe_subscription_id,account_type,plan_name,property_limit,member_limit,billing_override_reason";
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
      .select("organization_id, profile_id, role, created_at"),
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

  let organizationsRes: any = await serviceClient
    .from("organizations")
    .select(organizationSelect)
    .order("created_at", { ascending: false });

  if (organizationsRes.error?.code === "42703") {
    organizationsRes = await serviceClient
      .from("organizations")
      .select("id,name,slug,created_at,created_by,subscription_status,trial_started_at,trial_ends_at,billing_enabled,stripe_customer_id,stripe_subscription_id")
      .order("created_at", { ascending: false });
  }

  const responses = [
    organizationsRes,
    membersRes,
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
    account_type: "beta",
    plan_name: "Beta trial",
    property_limit: 10,
    member_limit: 15,
    ...organization,
  }));
  const members = (membersRes.data ?? []) as OrganizationMemberRow[];
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
        full_name: profile.full_name,
        email: profile.email,
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

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const { profile, serviceClient } = await requirePlatformAdmin(token);
    const organizations = await loadOrganizationOverview(serviceClient);
    const auditLogState = await loadRecentAuditLogs(serviceClient);
    const featureUsage = await loadFeatureUsageSummary(serviceClient);

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

    if (!body?.organizationId) {
      return NextResponse.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    }

    if (body.type === "extend_trial") {
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
    return NextResponse.json({
      ok: true,
      organizations,
      auditLogs: auditLogState.entries,
      auditLogAvailable: auditLogState.available,
      featureUsage,
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
