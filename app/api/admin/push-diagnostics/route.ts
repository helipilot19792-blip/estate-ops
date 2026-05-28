import { createClient } from "@supabase/supabase-js";
import { getPushEnvironmentDiagnostics } from "@/lib/server/staff-push-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PushPortal = "admin" | "cleaner" | "grounds" | "owner";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !publicKey || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function createAuthClient(token: string) {
  return createClient(supabaseUrl!, publicKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
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
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error("No profile was found for this user.");
  }

  if (profile.role === "platform_admin") {
    return;
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
}

function endpointHost(endpoint?: string | null) {
  try {
    return new URL(String(endpoint || "")).host;
  } catch {
    return "";
  }
}

function getDeviceKind(host: string, userAgent: string) {
  const lowerHost = host.toLowerCase();
  const ua = userAgent.toLowerCase();

  if (lowerHost.includes("push.apple.com") || ua.includes("iphone") || ua.includes("ipad")) return "apple";
  if (ua.includes("android")) return "android";
  if (ua.includes("windows") || ua.includes("macintosh") || ua.includes("linux")) return "desktop";
  return "unknown";
}

function getDeviceLabel(kind: string, userAgent: string) {
  if (kind === "apple") return userAgent.includes("iPad") ? "Apple iPad" : "Apple iPhone/Mac";
  if (kind === "android") return "Android";
  if (kind === "desktop") {
    if (userAgent.includes("Windows")) return "Desktop Windows";
    if (userAgent.includes("Macintosh")) return "Desktop Mac";
    return "Desktop";
  }
  return "Unknown device";
}

function emptyPortalSummary(portal: PushPortal) {
  return {
    portal,
    activeCount: 0,
    disabledCount: 0,
    androidActive: 0,
    appleActive: 0,
    desktopActive: 0,
    unknownActive: 0,
    devices: [] as Array<{
      id: string;
      profileId: string;
      status: "active" | "disabled";
      endpointHost: string;
      deviceKind: string;
      deviceLabel: string;
      lastSeenAt: string | null;
      updatedAt: string | null;
      userAgent: string;
    }>,
  };
}

async function getOrganizationProfileIds(organizationId: string) {
  const [adminMembersRes, cleanerAccountsRes, groundsAccountsRes, ownerAccountsRes] = await Promise.all([
    serviceClient
      .from("organization_members")
      .select("profile_id")
      .eq("organization_id", organizationId),
    serviceClient
      .from("cleaner_accounts")
      .select("id")
      .eq("organization_id", organizationId),
    serviceClient
      .from("grounds_accounts")
      .select("id")
      .eq("organization_id", organizationId),
    serviceClient
      .from("owner_accounts")
      .select("profile_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
  ]);

  for (const response of [adminMembersRes, cleanerAccountsRes, groundsAccountsRes, ownerAccountsRes]) {
    if (response.error) throw new Error(response.error.message);
  }

  const cleanerAccountIds = (cleanerAccountsRes.data || []).map((row: any) => row.id).filter(Boolean);
  const groundsAccountIds = (groundsAccountsRes.data || []).map((row: any) => row.id).filter(Boolean);

  const [cleanerMembersRes, groundsMembersRes] = await Promise.all([
    cleanerAccountIds.length > 0
      ? serviceClient
          .from("cleaner_account_members")
          .select("profile_id")
          .in("cleaner_account_id", cleanerAccountIds)
      : Promise.resolve({ data: [], error: null }),
    groundsAccountIds.length > 0
      ? serviceClient
          .from("grounds_account_members")
          .select("profile_id")
          .in("grounds_account_id", groundsAccountIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const response of [cleanerMembersRes, groundsMembersRes]) {
    if (response.error) throw new Error(response.error.message);
  }

  return new Set(
    [
      ...(adminMembersRes.data || []).map((row: any) => row.profile_id),
      ...(cleanerMembersRes.data || []).map((row: any) => row.profile_id),
      ...(groundsMembersRes.data || []).map((row: any) => row.profile_id),
      ...(ownerAccountsRes.data || []).map((row: any) => row.profile_id),
    ].filter(Boolean)
  );
}

export async function GET(request: Request) {
  try {
    const token = getBearerToken(request);
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId")?.trim() || "";

    if (!token) {
      return Response.json({ ok: false, error: "Missing authorization header." }, { status: 401 });
    }

    if (!organizationId) {
      return Response.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    }

    await requireAdminAccess(token, organizationId);
    const profileIds = await getOrganizationProfileIds(organizationId);

    const { data: subscriptions, error } =
      profileIds.size > 0
        ? await serviceClient
            .from("staff_push_subscriptions")
            .select("id,profile_id,portal,endpoint,user_agent,disabled_at,updated_at,last_seen_at")
            .in("profile_id", [...profileIds])
            .order("updated_at", { ascending: false })
        : { data: [], error: null };

    if (error) {
      throw new Error(error.message);
    }

    const portals = new Map<PushPortal, ReturnType<typeof emptyPortalSummary>>(
      (["admin", "cleaner", "grounds", "owner"] as PushPortal[]).map((portal) => [
        portal,
        emptyPortalSummary(portal),
      ])
    );

    for (const subscription of subscriptions || []) {
      const portal = subscription.portal as PushPortal;
      if (!portals.has(portal)) continue;

      const status = subscription.disabled_at ? "disabled" : "active";
      const host = endpointHost(subscription.endpoint);
      const userAgent = String(subscription.user_agent || "");
      const deviceKind = getDeviceKind(host, userAgent);
      const summary = portals.get(portal)!;

      if (status === "active") {
        summary.activeCount += 1;
        if (deviceKind === "android") summary.androidActive += 1;
        else if (deviceKind === "apple") summary.appleActive += 1;
        else if (deviceKind === "desktop") summary.desktopActive += 1;
        else summary.unknownActive += 1;
      } else {
        summary.disabledCount += 1;
      }

      summary.devices.push({
        id: subscription.id,
        profileId: subscription.profile_id,
        status,
        endpointHost: host,
        deviceKind,
        deviceLabel: getDeviceLabel(deviceKind, userAgent),
        lastSeenAt: subscription.last_seen_at || null,
        updatedAt: subscription.updated_at || null,
        userAgent,
      });
    }

    const portalSummaries = [...portals.values()];
    const totals = portalSummaries.reduce(
      (sum, portal) => ({
        active: sum.active + portal.activeCount,
        disabled: sum.disabled + portal.disabledCount,
        androidActive: sum.androidActive + portal.androidActive,
        appleActive: sum.appleActive + portal.appleActive,
        desktopActive: sum.desktopActive + portal.desktopActive,
        unknownActive: sum.unknownActive + portal.unknownActive,
      }),
      { active: 0, disabled: 0, androidActive: 0, appleActive: 0, desktopActive: 0, unknownActive: 0 }
    );

    return Response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      environment: getPushEnvironmentDiagnostics(),
      totals,
      portals: portalSummaries,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load push diagnostics." },
      { status: 500 }
    );
  }
}
