import { createClient } from "@supabase/supabase-js";

export type AdminV2Organization = {
  id: string;
  name: string;
  slug: string;
};

export type AdminV2Access = {
  profile: {
    id: string;
    displayName: string;
    role: "admin" | "platform_admin";
  };
  organizations: AdminV2Organization[];
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

type OrganizationRpcRow = {
  organization_id: string;
  organization_name?: string | null;
  organization_slug?: string | null;
};

type OrganizationRow = {
  id: string;
  name: string | null;
  slug: string | null;
};

export class AdminV2AccessError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AdminV2AccessError";
  }
}

function getSupabaseClients(token: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publicKey || !serviceRoleKey) {
    throw new AdminV2AccessError("V2 access is not configured.", 500);
  }

  const authClient = createClient(supabaseUrl, publicKey, {
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

function normalizeOrganization(row: OrganizationRpcRow): AdminV2Organization {
  return {
    id: row.organization_id,
    name: row.organization_name?.trim() || row.organization_slug?.trim() || "Organization",
    slug: row.organization_slug?.trim() || "",
  };
}

export async function getAdminV2Access(token: string): Promise<AdminV2Access> {
  if (!token) {
    throw new AdminV2AccessError("Sign in is required.", 401);
  }

  const { authClient, serviceClient } = getSupabaseClients(token);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new AdminV2AccessError("Your session could not be verified.", 401);
  }

  const { data: profileData, error: profileError } = await serviceClient
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("id", user.id)
    .single();

  const profile = profileData as ProfileRow | null;
  if (profileError || !profile) {
    throw new AdminV2AccessError("Your admin profile could not be verified.", 403);
  }

  if (profile.role !== "admin" && profile.role !== "platform_admin") {
    throw new AdminV2AccessError("Gulera OS 2.0 Preview requires admin access.", 403);
  }

  let organizations: AdminV2Organization[] = [];

  if (profile.role === "platform_admin") {
    const { data, error } = await serviceClient
      .from("organizations")
      .select("id,name,slug")
      .order("name", { ascending: true });

    if (error) {
      throw new AdminV2AccessError("Organizations could not be loaded.", 500);
    }

    organizations = ((data || []) as OrganizationRow[]).map((organization) => ({
      id: organization.id,
      name: organization.name?.trim() || organization.slug?.trim() || "Organization",
      slug: organization.slug?.trim() || "",
    }));
  } else {
    const { data, error } = await authClient.rpc("get_my_organizations");

    if (error) {
      throw new AdminV2AccessError("Your organization access could not be verified.", 403);
    }

    organizations = ((data || []) as OrganizationRpcRow[])
      .filter((organization) => Boolean(organization.organization_id))
      .map(normalizeOrganization);
  }

  if (organizations.length === 0) {
    throw new AdminV2AccessError("No authorized organization is available for this account.", 403);
  }

  return {
    profile: {
      id: profile.id,
      displayName: profile.full_name?.trim() || profile.email?.split("@")[0] || "Operator",
      role: profile.role,
    },
    organizations,
  };
}
