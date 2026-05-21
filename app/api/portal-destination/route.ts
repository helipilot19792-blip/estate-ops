import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
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

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "";

    if (!token) {
      return Response.json({ ok: false, error: "Missing authorization header." }, { status: 401 });
    }

    const authClient = createAuthClient(token);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return Response.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id,email,full_name,phone,role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return Response.json(
        { ok: false, error: profileError?.message || "No profile is linked to this sign-in yet." },
        { status: 404 }
      );
    }

    const [
      { data: cleanerMemberships, error: cleanerError },
      { data: groundsMemberships, error: groundsError },
      { data: ownerAccounts, error: ownerError },
    ] =
      await Promise.all([
        serviceClient
          .from("cleaner_account_members")
          .select("id")
          .eq("profile_id", user.id)
          .limit(1),
        serviceClient
          .from("grounds_account_members")
          .select("id")
          .eq("profile_id", user.id)
          .limit(1),
        serviceClient
          .from("owner_accounts")
          .select("id")
          .eq("profile_id", user.id)
          .eq("is_active", true)
          .limit(1),
      ]);

    if (cleanerError || groundsError || ownerError) {
      return Response.json(
        {
          ok: false,
          error:
            cleanerError?.message ||
            groundsError?.message ||
            ownerError?.message ||
            "Could not check portal access.",
        },
        { status: 500 }
      );
    }

    const hasCleaner = !!cleanerMemberships?.length;
    const hasGrounds = !!groundsMemberships?.length;
    const hasOwner = !!ownerAccounts?.length;
    let destination = "/login";

    if (profile.role === "platform_admin") {
      destination = "/platform";
    } else if (profile.role === "admin") {
      destination = "/admin";
    } else if (hasCleaner && hasGrounds) {
      destination = "/choose-portal";
    } else if (hasCleaner) {
      destination = "/cleaner";
    } else if (hasGrounds) {
      destination = "/grounds";
    } else if (hasOwner || profile.role === "owner") {
      destination = "/owner";
    }

    return Response.json({
      ok: true,
      destination,
      profile,
      access: {
        cleaner: hasCleaner,
        grounds: hasGrounds,
        owner: hasOwner,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resolve portal access.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
