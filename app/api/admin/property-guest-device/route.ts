import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createGuestDeviceToken, hashGuestDeviceToken } from "@/lib/server/guest-device";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
type AdminProfileRow = {
  id: string;
  role: string | null;
};

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

function getClients(token: string) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  const authClient = createClient(supabaseUrl, publicSupabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { authClient, serviceClient };
}

async function requireAdminAccess(
  serviceClient: ReturnType<typeof getClients>["serviceClient"],
  token: string,
  organizationId: string,
  propertyId: string
) {
  const { authClient } = getClients(token);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Unauthorized.");
  }

  const { data: profileData, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();
  const profile = (profileData as AdminProfileRow | null);

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
    throw new Error("Admin access required.");
  }

  if (profile.role !== "platform_admin") {
    const { data: membership, error: membershipError } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (membershipError) {
      throw new Error(membershipError.message);
    }

    if (!membership) {
      throw new Error("Admin access required for this organization.");
    }
  }

  const { data: property, error: propertyError } = await serviceClient
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (propertyError) {
    throw new Error(propertyError.message);
  }

  if (!property) {
    throw new Error("Property not found in this organization.");
  }

  return { user };
}

export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim() || "";
    const propertyId = request.nextUrl.searchParams.get("propertyId")?.trim() || "";

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token." }, { status: 401 });
    }

    if (!organizationId || !propertyId) {
      return NextResponse.json({ ok: false, error: "Missing organization or property." }, { status: 400 });
    }

    const { serviceClient } = getClients(token);
    await requireAdminAccess(serviceClient, token, organizationId, propertyId);

    const { data, error } = await serviceClient
      .from("property_guest_devices")
      .select("id,label,token_last_four,last_seen_at,revoked_at,revoke_reason,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      devices: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load guest devices." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();
    const label = String(body?.label || "").trim();

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token." }, { status: 401 });
    }

    if (!organizationId || !propertyId) {
      return NextResponse.json({ ok: false, error: "Missing organization or property." }, { status: 400 });
    }

    if (!label) {
      return NextResponse.json({ ok: false, error: "Device label is required." }, { status: 400 });
    }

    if (label.length > 80) {
      return NextResponse.json({ ok: false, error: "Device label must be 80 characters or less." }, { status: 400 });
    }

    const { serviceClient } = getClients(token);
    const { user } = await requireAdminAccess(serviceClient, token, organizationId, propertyId);

    const deviceToken = createGuestDeviceToken();
    const tokenHash = hashGuestDeviceToken(deviceToken);
    const now = new Date().toISOString();

    const { data, error } = await serviceClient
      .from("property_guest_devices")
      .insert({
        organization_id: organizationId,
        property_id: propertyId,
        label,
        token_hash: tokenHash,
        token_last_four: deviceToken.slice(-4),
        created_by_profile_id: user.id,
        updated_at: now,
      })
      .select("id,label,token_last_four,last_seen_at,revoked_at,revoke_reason,created_at,updated_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      device: data,
      deviceToken,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not create guest device." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();
    const deviceId = String(body?.deviceId || "").trim();
    const revokeReason = String(body?.revokeReason || "").trim();

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token." }, { status: 401 });
    }

    if (!organizationId || !propertyId || !deviceId) {
      return NextResponse.json({ ok: false, error: "Missing organization, property, or device." }, { status: 400 });
    }

    const { serviceClient } = getClients(token);
    await requireAdminAccess(serviceClient, token, organizationId, propertyId);

    const { data, error } = await serviceClient
      .from("property_guest_devices")
      .update({
        revoked_at: new Date().toISOString(),
        revoke_reason: revokeReason || "Revoked from property setup.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", deviceId)
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("revoked_at", null)
      .select("id,label,token_last_four,last_seen_at,revoked_at,revoke_reason,created_at,updated_at")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Active guest device not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      device: data,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not revoke guest device." },
      { status: 500 }
    );
  }
}
