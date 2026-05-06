import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type FeatureUsagePayload = {
  organizationId?: string | null;
  portal?: string | null;
  area?: string | null;
  featureKey?: string | null;
  featureLabel?: string | null;
  action?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown> | null;
};

const ALLOWED_PORTALS = new Set(["admin", "owner", "cleaner", "grounds", "platform"]);

function sanitizeText(value: unknown, maxLength: number) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

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

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const { authClient, serviceClient } = getClients(token);
    const body = (await req.json().catch(() => null)) as FeatureUsagePayload | null;

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const organizationId = sanitizeText(body?.organizationId, 80);
    const portal = sanitizeText(body?.portal, 32).toLowerCase();
    const area = sanitizeText(body?.area, 80);
    const featureKey = sanitizeText(body?.featureKey, 120);
    const featureLabel = sanitizeText(body?.featureLabel, 160);
    const action = sanitizeText(body?.action || "open", 40).toLowerCase();
    const path = sanitizeText(body?.path, 300);

    if (!organizationId || !ALLOWED_PORTALS.has(portal) || !area || !featureKey || !featureLabel) {
      return NextResponse.json({ ok: false, error: "Missing feature usage details." }, { status: 400 });
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    const isPlatformAdmin = profile?.role === "platform_admin";
    const { data: membership } = await serviceClient
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .maybeSingle();

    const { data: ownerAccount } = user.email
      ? await serviceClient
          .from("owner_accounts")
          .select("organization_id")
          .eq("organization_id", organizationId)
          .eq("email", user.email.trim().toLowerCase())
          .maybeSingle()
      : { data: null };

    if (!isPlatformAdmin && !membership && !ownerAccount) {
      return NextResponse.json({ ok: false, error: "Organization access required." }, { status: 403 });
    }

    const { error: insertError } = await serviceClient.from("feature_usage_events").insert({
      organization_id: organizationId,
      actor_profile_id: user.id,
      actor_role: profile?.role || null,
      portal,
      area,
      feature_key: featureKey,
      feature_label: featureLabel,
      action,
      path: path || null,
      metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
