import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function requireAdmin(token: string, organizationId: string) {
  const authClient = createClient(supabaseUrl!, publicSupabaseKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();
  if (userError || !user) throw new Error("Not authenticated.");

  const service = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) throw new Error("No profile was found.");
  if (profile.role === "platform_admin") return { service, user };

  const { data: membership, error: membershipError } = await service
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (membershipError || membership?.role !== "admin") throw new Error("Admin access required.");
  return { service, user };
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase server environment variables." }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();
    const title = String(body?.title || "").trim();
    const description = String(body?.description || "").trim();
    const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0;
    if (!organizationId || !propertyId || !title) {
      return NextResponse.json({ error: "Missing checklist item details." }, { status: 400 });
    }

    const { service } = await requireAdmin(token, organizationId);
    const { data: property, error: propertyError } = await service
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });
    if (!property) return NextResponse.json({ error: "Property not found in this organization." }, { status: 404 });

    const { data: item, error } = await service
      .from("property_cleaning_checklist_items")
      .insert({
        organization_id: organizationId,
        property_id: propertyId,
        title,
        description: description || null,
        sort_order: sortOrder,
        active: true,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save checklist item." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase server environment variables." }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId")?.trim() || "";
    const itemId = searchParams.get("itemId")?.trim() || "";
    if (!organizationId || !itemId) return NextResponse.json({ error: "Missing checklist item." }, { status: 400 });

    const { service } = await requireAdmin(token, organizationId);
    const { error } = await service
      .from("property_cleaning_checklist_items")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("organization_id", organizationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete checklist item." },
      { status: 500 }
    );
  }
}
