import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AppPortal = "admin" | "cleaner" | "grounds" | "owner";

type SerializedPushSubscription = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

const DEFAULT_VAPID_PUBLIC_KEY = "BDetbzBPxu1z9Qzcp7t4pRnce_wS_SbHnTTabNHohR7Li1rJaKfgHBs_AlGkl9AfG4qf6fxTNwiWwqkiWGBTEK4";

function isValidVapidPublicKey(value?: string | null) {
  const key = String(value || "").trim();
  if (!key || key.startsWith("sk_")) return false;

  try {
    const padding = "=".repeat((4 - (key.length % 4)) % 4);
    const decoded = Buffer.from((key + padding).replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return decoded.length === 65 && decoded[0] === 4;
  } catch {
    return false;
  }
}

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publicKey || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return { supabaseUrl, publicKey, serviceRoleKey };
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

function getPortal(value: unknown): AppPortal | null {
  return value === "admin" || value === "cleaner" || value === "grounds" || value === "owner" ? value : null;
}

function getVapidPublicKey() {
  const candidates = [
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PUBLIC_KEY,
    DEFAULT_VAPID_PUBLIC_KEY,
  ];

  return candidates.find(isValidVapidPublicKey) || DEFAULT_VAPID_PUBLIC_KEY;
}

async function getSignedInProfile(token: string) {
  const { supabaseUrl, publicKey, serviceRoleKey } = getEnv();

  const authClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated.");
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, email, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error(profileError?.message || "No profile is linked to this sign-in yet.");
  }

  return { service, profile };
}

async function assertPortalMembership(
  service: any,
  profileId: string,
  portal: AppPortal,
  role?: string | null
) {
  if (portal === "admin") {
    if (role === "admin" || role === "platform_admin") return;
    throw new Error("This sign-in is not linked to an admin account.");
  }

  if (portal === "owner") {
    const { data, error } = await service
      .from("owner_accounts")
      .select("id")
      .eq("profile_id", profileId)
      .eq("is_active", true)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      throw new Error("This sign-in is not linked to an owner account.");
    }
    return;
  }

  const membershipTable =
    portal === "cleaner" ? "cleaner_account_members" : "grounds_account_members";

  const { data, error } = await service
    .from(membershipTable)
    .select("id")
    .eq("profile_id", profileId)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error(`This sign-in is not linked to a ${portal} account.`);
  }
}

function serializeSubscription(value: SerializedPushSubscription) {
  const endpoint = String(value.endpoint || "").trim();
  const p256dh = String(value.keys?.p256dh || "").trim();
  const auth = String(value.keys?.auth || "").trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription is missing endpoint or keys.");
  }

  return {
    endpoint,
    p256dh,
    auth,
    subscription: {
      endpoint,
      expirationTime: value.expirationTime ?? null,
      keys: { p256dh, auth },
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    const portal = getPortal(request.nextUrl.searchParams.get("portal"));
    const publicKey = getVapidPublicKey();

    if (!token) {
      return NextResponse.json({
        ok: true,
        subscribed: false,
        publicKey,
        needsAuth: true,
      });
    }

    if (!portal) {
      return NextResponse.json({ ok: false, error: "Unknown staff portal." }, { status: 400 });
    }

    const { service, profile } = await getSignedInProfile(token);
    await assertPortalMembership(service, profile.id, portal, profile.role);

    const { count, error } = await service
      .from("staff_push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .eq("portal", portal)
      .is("disabled_at", null);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      subscribed: (count ?? 0) > 0,
      publicKey,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load push status." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    const body = await request.json().catch(() => null);
    const portal = getPortal(body?.portal);

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token." }, { status: 401 });
    }

    if (!portal) {
      return NextResponse.json({ ok: false, error: "Unknown staff portal." }, { status: 400 });
    }

    const { endpoint, p256dh, auth, subscription } = serializeSubscription(body?.subscription || {});
    const { service, profile } = await getSignedInProfile(token);
    await assertPortalMembership(service, profile.id, portal, profile.role);

    const now = new Date().toISOString();
    const { error } = await service
      .from("staff_push_subscriptions")
      .upsert(
        {
          profile_id: profile.id,
          portal,
          endpoint,
          p256dh,
          auth,
          subscription,
          user_agent: request.headers.get("user-agent"),
          updated_at: now,
          last_seen_at: now,
          disabled_at: null,
        },
        { onConflict: "profile_id,portal,endpoint" }
      );

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, subscribed: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save push subscription." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    const body = await request.json().catch(() => null);
    const portal = getPortal(body?.portal);
    const endpoint = String(body?.endpoint || "").trim();

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token." }, { status: 401 });
    }

    if (!portal) {
      return NextResponse.json({ ok: false, error: "Unknown staff portal." }, { status: 400 });
    }

    const { service, profile } = await getSignedInProfile(token);
    await assertPortalMembership(service, profile.id, portal, profile.role);

    let query = service
      .from("staff_push_subscriptions")
      .update({
        disabled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profile.id)
      .eq("portal", portal)
      .is("disabled_at", null);

    if (endpoint) {
      query = query.eq("endpoint", endpoint);
    }

    const { error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, subscribed: false });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not remove push subscription." },
      { status: 500 }
    );
  }
}
