import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

type OrganizationMemberRow = {
  id: string;
  organization_id: string;
  profile_id: string;
  role: string | null;
  ai_copilot_enabled?: boolean | null;
};

type PlatformSettingsRow = {
  id: boolean;
  ai_copilot_enabled?: boolean | null;
};

export type AiCopilotGateState = {
  allowed: boolean;
  reason:
    | "allowed"
    | "controls_missing"
    | "global_disabled"
    | "organization_disabled"
    | "user_disabled"
    | "not_admin_member"
    | "platform_admin_bypass";
  globalEnabled: boolean;
  organizationEnabled: boolean;
  userEnabled: boolean;
};

export function getAiCopilotBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "";
}

function createServerClients(token: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { authClient, serviceClient };
}

function isMissingAiCopilotControlsError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message || "";
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    message.includes("platform_settings") ||
    message.includes("ai_copilot_enabled")
  );
}

async function loadPlatformSettings(serviceClient: SupabaseClient) {
  const { data, error } = await serviceClient
    .from("platform_settings")
    .select("id,ai_copilot_enabled")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if (isMissingAiCopilotControlsError(error)) {
      return {
        available: false,
        row: null,
      };
    }

    throw new Error(error.message);
  }

  return {
    available: true,
    row: (data ?? null) as PlatformSettingsRow | null,
  };
}

async function loadProfile(serviceClient: SupabaseClient, profileId: string) {
  const { data, error } = await serviceClient
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("id", profileId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "No profile was found for this user.");
  }

  return data as ProfileRow;
}

async function loadOrganizationMembership(serviceClient: SupabaseClient, organizationId: string, profileId: string) {
  const { data, error } = await serviceClient
    .from("organization_members")
    .select("id,organization_id,profile_id,role,ai_copilot_enabled")
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    if (isMissingAiCopilotControlsError(error)) {
      const fallback = await serviceClient
        .from("organization_members")
        .select("id,organization_id,profile_id,role")
        .eq("organization_id", organizationId)
        .eq("profile_id", profileId)
        .maybeSingle();

      if (fallback.error) {
        throw new Error(fallback.error.message);
      }

      return (fallback.data
        ? {
            ...fallback.data,
            ai_copilot_enabled: false,
          }
        : null) as OrganizationMemberRow | null;
    }

    throw new Error(error.message);
  }

  return (data ?? null) as OrganizationMemberRow | null;
}

export async function getAiCopilotGateState(options: {
  serviceClient: SupabaseClient;
  organizationId: string;
  profile: ProfileRow;
  allowPlatformAdminBypass?: boolean;
}) {
  const platformSettings = await loadPlatformSettings(options.serviceClient);
  const organizationRes = await options.serviceClient
    .from("organizations")
    .select("id,ai_copilot_enabled")
    .eq("id", options.organizationId)
    .maybeSingle();

  if (organizationRes.error) {
    if (isMissingAiCopilotControlsError(organizationRes.error)) {
      return {
        gate: {
          allowed: false,
          reason: "controls_missing",
          globalEnabled: false,
          organizationEnabled: false,
          userEnabled: false,
        } satisfies AiCopilotGateState,
        membership: null,
      };
    }

    throw new Error(organizationRes.error.message);
  }

  const organizationEnabled = Boolean(organizationRes.data?.ai_copilot_enabled);
  const globalEnabled = platformSettings.available && Boolean(platformSettings.row?.ai_copilot_enabled);
  const allowPlatformAdminBypass = options.allowPlatformAdminBypass !== false;

  if (!platformSettings.available) {
    return {
      gate: {
        allowed: false,
        reason: "controls_missing",
        globalEnabled: false,
        organizationEnabled,
        userEnabled: false,
      } satisfies AiCopilotGateState,
      membership: null,
    };
  }

  if (!globalEnabled) {
    return {
      gate: {
        allowed: false,
        reason: "global_disabled",
        globalEnabled,
        organizationEnabled,
        userEnabled: false,
      } satisfies AiCopilotGateState,
      membership: null,
    };
  }

  if (!organizationEnabled) {
    return {
      gate: {
        allowed: false,
        reason: "organization_disabled",
        globalEnabled,
        organizationEnabled,
        userEnabled: false,
      } satisfies AiCopilotGateState,
      membership: null,
    };
  }

  if (options.profile.role === "platform_admin" && allowPlatformAdminBypass) {
    return {
      gate: {
        allowed: true,
        reason: "platform_admin_bypass",
        globalEnabled,
        organizationEnabled,
        userEnabled: true,
      } satisfies AiCopilotGateState,
      membership: null,
    };
  }

  const membership = await loadOrganizationMembership(
    options.serviceClient,
    options.organizationId,
    options.profile.id
  );

  if (!membership || membership.role !== "admin") {
    return {
      gate: {
        allowed: false,
        reason: "not_admin_member",
        globalEnabled,
        organizationEnabled,
        userEnabled: false,
      } satisfies AiCopilotGateState,
      membership,
    };
  }

  const userEnabled = Boolean(membership.ai_copilot_enabled);
  if (!userEnabled) {
    return {
      gate: {
        allowed: false,
        reason: "user_disabled",
        globalEnabled,
        organizationEnabled,
        userEnabled,
      } satisfies AiCopilotGateState,
      membership,
    };
  }

  return {
    gate: {
      allowed: true,
      reason: "allowed",
      globalEnabled,
      organizationEnabled,
      userEnabled,
    } satisfies AiCopilotGateState,
    membership,
  };
}

export async function requireAiCopilotAccess(options: {
  token: string;
  organizationId: string;
  allowPlatformAdminBypass?: boolean;
}) {
  if (!options.token) {
    throw new Error("Missing authorization header.");
  }

  if (!options.organizationId) {
    throw new Error("Missing organizationId.");
  }

  const { authClient, serviceClient } = createServerClients(options.token);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated.");
  }

  const profile = await loadProfile(serviceClient, user.id);
  const { gate, membership } = await getAiCopilotGateState({
    serviceClient,
    organizationId: options.organizationId,
    profile,
    allowPlatformAdminBypass: options.allowPlatformAdminBypass,
  });

  if (!gate.allowed) {
    switch (gate.reason) {
      case "controls_missing":
        throw new Error("AI copilot controls are missing. Run supabase/add_ai_copilot_controls.sql in Supabase first.");
      case "global_disabled":
        throw new Error("AI Copilot is globally disabled.");
      case "organization_disabled":
        throw new Error("AI Copilot is disabled for this organization.");
      case "user_disabled":
        throw new Error("AI Copilot is not enabled for your admin account.");
      case "not_admin_member":
        throw new Error("Admin access required for this organization.");
      default:
        throw new Error("AI Copilot access is blocked.");
    }
  }

  return {
    authClient,
    serviceClient,
    user: user as User,
    profile,
    membership,
    gate,
  };
}
