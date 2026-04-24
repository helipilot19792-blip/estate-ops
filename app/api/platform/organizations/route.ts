import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const { profile, serviceClient } = await requirePlatformAdmin(token);
    const organizations = await loadOrganizationOverview(serviceClient);

    return NextResponse.json({
      ok: true,
      currentProfile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
      },
      organizations,
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
    const { serviceClient } = await requirePlatformAdmin(token);
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
    } else {
      return NextResponse.json({ ok: false, error: "Unsupported platform action." }, { status: 400 });
    }

    const organizations = await loadOrganizationOverview(serviceClient);
    return NextResponse.json({ ok: true, organizations });
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
