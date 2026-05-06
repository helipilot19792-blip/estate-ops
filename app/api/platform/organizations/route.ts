import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isMissingAuditLogTableError, writeAuditLog } from "@/lib/server/audit-log";

export const dynamic = "force-dynamic";

type PlatformAction =
  | { type: "extend_trial"; organizationId: string; days?: number }
  | { type: "set_status"; organizationId: string; status: "trialing" | "active" | "past_due" | "canceled" | "suspended" };

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
  const [
    organizationsRes,
    membersRes,
    profilesRes,
    propertiesRes,
    turnoverJobsRes,
    groundsJobsRes,
    ownerAccountsRes,
  ] = await Promise.all([
    serviceClient
      .from("organizations")
      .select("id,name,slug,created_at,created_by,subscription_status,trial_started_at,trial_ends_at,billing_enabled,stripe_customer_id,stripe_subscription_id")
      .order("created_at", { ascending: false }),
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

  const organizations = (organizationsRes.data ?? []) as OrganizationRow[];
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
