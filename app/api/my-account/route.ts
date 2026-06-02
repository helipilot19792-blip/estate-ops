import { NextRequest, NextResponse } from "next/server";
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

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "";
}

type PortalKind = "admin" | "owner" | "cleaner" | "grounds" | "platform" | null;

function normalizePortal(value: string | null | undefined): PortalKind {
  if (value === "admin" || value === "owner" || value === "cleaner" || value === "grounds" || value === "platform") {
    return value;
  }
  return null;
}

async function getSignedInUser(token: string) {
  const authClient = createAuthClient(token);
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) {
    throw new Error("Not authenticated.");
  }

  return user;
}

async function loadPortalIdentity(userId: string, portal: PortalKind, profile: any) {
  if (portal === "owner") {
    const { data: ownerAccount } = await serviceClient
      .from("owner_accounts")
      .select("id,email,full_name,is_active,organization_id")
      .eq("profile_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ownerAccount) {
      return {
        source: "owner_account",
        portal: "owner",
        id: ownerAccount.id,
        role: "owner",
        email: ownerAccount.email || profile?.email || null,
        full_name: ownerAccount.full_name || profile?.full_name || null,
        phone: profile?.phone || null,
        organization_id: ownerAccount.organization_id || null,
      };
    }
  }

  if (portal === "cleaner") {
    const { data: membership } = await serviceClient
      .from("cleaner_account_members")
      .select("cleaner_account_id")
      .eq("profile_id", userId)
      .limit(1)
      .maybeSingle();

    if (membership?.cleaner_account_id) {
      const { data: cleanerAccount } = await serviceClient
        .from("cleaner_accounts")
        .select("id,email,display_name,phone,organization_id,active")
        .eq("id", membership.cleaner_account_id)
        .maybeSingle();

      if (cleanerAccount) {
        return {
          source: "cleaner_account",
          portal: "cleaner",
          id: cleanerAccount.id,
          role: "cleaner",
          email: cleanerAccount.email || profile?.email || null,
          full_name: cleanerAccount.display_name || profile?.full_name || null,
          phone: cleanerAccount.phone || profile?.phone || null,
          organization_id: cleanerAccount.organization_id || null,
        };
      }
    }
  }

  if (portal === "grounds") {
    const { data: membership } = await serviceClient
      .from("grounds_account_members")
      .select("grounds_account_id")
      .eq("profile_id", userId)
      .limit(1)
      .maybeSingle();

    if (membership?.grounds_account_id) {
      const { data: groundsAccount } = await serviceClient
        .from("grounds_accounts")
        .select("id,email,display_name,phone,organization_id,active")
        .eq("id", membership.grounds_account_id)
        .maybeSingle();

      if (groundsAccount) {
        return {
          source: "grounds_account",
          portal: "grounds",
          id: groundsAccount.id,
          role: "grounds",
          email: groundsAccount.email || profile?.email || null,
          full_name: groundsAccount.display_name || profile?.full_name || null,
          phone: groundsAccount.phone || profile?.phone || null,
          organization_id: groundsAccount.organization_id || null,
        };
      }
    }
  }

  return {
    source: "profile",
    portal: portal || "account",
    id: profile?.id || userId,
    role: portal === "platform" ? "platform" : profile?.role || null,
    email: profile?.email || null,
    full_name: profile?.full_name || null,
    phone: profile?.phone || null,
    organization_id: null,
  };
}

async function syncPortalIdentity(userId: string, portal: PortalKind, fullName: string, phone: string) {
  if (portal === "owner") {
    await serviceClient
      .from("owner_accounts")
      .update({ full_name: fullName || null })
      .eq("profile_id", userId)
      .eq("is_active", true);
    return;
  }

  if (portal === "cleaner") {
    const { data: memberships } = await serviceClient
      .from("cleaner_account_members")
      .select("cleaner_account_id")
      .eq("profile_id", userId);
    const accountIds = [...new Set((memberships ?? []).map((row: any) => row.cleaner_account_id).filter(Boolean))];
    if (accountIds.length > 0) {
      await serviceClient
        .from("cleaner_accounts")
        .update({ display_name: fullName || null, phone: phone || null })
        .in("id", accountIds);
    }
    return;
  }

  if (portal === "grounds") {
    const { data: memberships } = await serviceClient
      .from("grounds_account_members")
      .select("grounds_account_id")
      .eq("profile_id", userId);
    const accountIds = [...new Set((memberships ?? []).map((row: any) => row.grounds_account_id).filter(Boolean))];
    if (accountIds.length > 0) {
      await serviceClient
        .from("grounds_accounts")
        .update({ display_name: fullName || null, phone: phone || null })
        .in("id", accountIds);
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing authorization header." }, { status: 401 });
    }

    const user = await getSignedInUser(token);
    const { searchParams } = new URL(request.url);
    const portal = normalizePortal(searchParams.get("portal"));
    const { data: profile, error } = await serviceClient
      .from("profiles")
      .select("id,email,full_name,phone,role,created_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email || profile?.email || null,
      },
      profile: profile || null,
      identity: await loadPortalIdentity(user.id, portal, profile),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load account." },
      { status: 401 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing authorization header." }, { status: 401 });
    }

    const user = await getSignedInUser(token);
    const body = await request.json().catch(() => null);
    const portal = normalizePortal(body?.portal);
    const fullName = typeof body?.fullName === "string" ? body.fullName.trim().slice(0, 160) : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim().slice(0, 80) : "";

    const { data: profile, error } = await serviceClient
      .from("profiles")
      .update({
        full_name: fullName || null,
        phone: phone || null,
      })
      .eq("id", user.id)
      .select("id,email,full_name,phone,role,created_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    await syncPortalIdentity(user.id, portal, fullName, phone);

    return NextResponse.json({
      ok: true,
      profile,
      identity: await loadPortalIdentity(user.id, portal, profile),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not update account." },
      { status: 401 }
    );
  }
}
