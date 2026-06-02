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

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing authorization header." }, { status: 401 });
    }

    const user = await getSignedInUser(token);
    const body = await request.json().catch(() => null);
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
    const confirmed = body?.confirmed === true;

    if (!confirmed) {
      return NextResponse.json({ ok: false, error: "Deletion request confirmation is required." }, { status: 400 });
    }

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id,email,full_name,phone,role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ ok: false, error: profileError?.message || "Profile not found." }, { status: 500 });
    }

    const { data: existingOpenRequest, error: existingError } = await serviceClient
      .from("account_deletion_requests")
      .select("id,status,requested_at")
      .eq("requester_profile_id", user.id)
      .in("status", ["pending", "reviewing"])
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
    }

    if (existingOpenRequest) {
      return NextResponse.json({
        ok: true,
        alreadyOpen: true,
        request: existingOpenRequest,
      });
    }

    const { data: membership } = await serviceClient
      .from("organization_members")
      .select("organization_id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();

    const { data: ownerAccount } = !membership?.organization_id
      ? await serviceClient
          .from("owner_accounts")
          .select("organization_id")
          .eq("profile_id", user.id)
          .limit(1)
          .maybeSingle()
      : { data: null };

    const organizationId = membership?.organization_id || ownerAccount?.organization_id || null;

    const { data: deletionRequest, error: insertError } = await serviceClient
      .from("account_deletion_requests")
      .insert({
        requester_profile_id: user.id,
        requester_email: profile.email || user.email || null,
        requester_role: profile.role || null,
        organization_id: organizationId,
        reason: reason || null,
        status: "pending",
      })
      .select("id,status,requested_at")
      .single();

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      request: deletionRequest,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not submit deletion request." },
      { status: 401 }
    );
  }
}
