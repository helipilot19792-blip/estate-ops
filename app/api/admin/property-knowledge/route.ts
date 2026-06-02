import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function missingEnvResponse() {
  return NextResponse.json(
    { error: "Missing Supabase server environment variables." },
    { status: 500 }
  );
}

function cleanText(value: unknown, maxLength = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function requireAdmin(serviceClient: any, userId: string, organizationId: string) {
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
    return false;
  }

  if (profile.role === "platform_admin") return true;

  const { data: membership, error: membershipError } = await serviceClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (membershipError) throw new Error(membershipError.message);
  return Boolean(membership);
}

async function getUserFromRequest(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey) throw new Error("Missing Supabase server environment variables.");

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;

  const authClient = createClient(supabaseUrl, publicSupabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) return null;
  return user;
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) return missingEnvResponse();

  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = await request.json().catch(() => null);
    const organizationId = cleanText(body?.organizationId, 80);
    const propertyId = cleanText(body?.propertyId, 80);

    if (!organizationId || !propertyId) {
      return NextResponse.json({ error: "Property and organization are required." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const hasAccess = await requireAdmin(serviceClient, user.id, organizationId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Admin access required for this organization." }, { status: 403 });
    }

    const { data: property, error: propertyError } = await serviceClient
      .from("properties")
      .select("id, organization_id")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });
    if (!property) return NextResponse.json({ error: "Property not found in this organization." }, { status: 404 });

    const payload = {
      organization_id: organizationId,
      property_id: propertyId,
      wifi_network: cleanText(body?.wifiNetwork, 300) || null,
      wifi_password: cleanText(body?.wifiPassword, 300) || null,
      access_summary: cleanText(body?.accessSummary) || null,
      lockbox_location: cleanText(body?.lockboxLocation) || null,
      water_shutoff_location: cleanText(body?.waterShutoffLocation) || null,
      electrical_panel_location: cleanText(body?.electricalPanelLocation) || null,
      trash_instructions: cleanText(body?.trashInstructions) || null,
      owner_preferences: cleanText(body?.ownerPreferences) || null,
      cleaner_notes: cleanText(body?.cleanerNotes) || null,
      maintenance_notes: cleanText(body?.maintenanceNotes) || null,
      appliance_notes: cleanText(body?.applianceNotes) || null,
      emergency_notes: cleanText(body?.emergencyNotes) || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await serviceClient
      .from("property_knowledge")
      .upsert(payload, { onConflict: "property_id" })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, knowledge: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save property knowledge." },
      { status: 500 }
    );
  }
}
