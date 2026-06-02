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

function cleanText(value: unknown, maxLength = 500) {
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
    const vendorId = cleanText(body?.vendorId, 80);
    const vendorName = cleanText(body?.vendorName, 160);

    if (!organizationId || !propertyId || !vendorName) {
      return NextResponse.json({ error: "Vendor name and property are required." }, { status: 400 });
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
      vendor_name: vendorName,
      category: cleanText(body?.category, 120) || null,
      contact_name: cleanText(body?.contactName, 160) || null,
      phone: cleanText(body?.phone, 80) || null,
      email: cleanText(body?.email, 160) || null,
      website: cleanText(body?.website, 300) || null,
      emergency_available: body?.emergencyAvailable === true,
      preferred: body?.preferred !== false,
      notes: cleanText(body?.notes, 2000) || null,
      updated_at: new Date().toISOString(),
    };

    const result = vendorId
      ? await serviceClient
          .from("property_vendors")
          .update(payload)
          .eq("id", vendorId)
          .eq("organization_id", organizationId)
          .select("*")
          .single()
      : await serviceClient
          .from("property_vendors")
          .insert(payload)
          .select("*")
          .single();

    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, vendor: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save property vendor." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) return missingEnvResponse();

  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const organizationId = cleanText(searchParams.get("organizationId"), 80);
    const vendorId = cleanText(searchParams.get("vendorId"), 80);

    if (!organizationId || !vendorId) {
      return NextResponse.json({ error: "Missing vendor details." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const hasAccess = await requireAdmin(serviceClient, user.id, organizationId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Admin access required for this organization." }, { status: 403 });
    }

    const { error } = await serviceClient
      .from("property_vendors")
      .delete()
      .eq("id", vendorId)
      .eq("organization_id", organizationId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete property vendor." },
      { status: 500 }
    );
  }
}
