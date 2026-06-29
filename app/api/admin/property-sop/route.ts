import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function verifyAdmin(serviceClient: any, userId: string, organizationId: string) {
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw profileError;

  if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
    return false;
  }

  if (profile.role === "platform_admin") {
    return true;
  }

  const { data: membership, error: membershipError } = await serviceClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (membershipError) throw membershipError;
  return !!membership;
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase server environment variables." },
      { status: 500 }
    );
  }

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, publicSupabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const action = String(body?.action || "").trim();
    const organizationId = String(body?.organizationId || "").trim();

    if (!organizationId) {
      return NextResponse.json({ error: "Missing organization." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const hasAdminAccess = await verifyAdmin(serviceClient, user.id, organizationId);
    if (!hasAdminAccess) {
      return NextResponse.json({ error: "Admin access required for this organization." }, { status: 403 });
    }

    if (action === "create") {
      const propertyId = String(body?.propertyId || "").trim();
      const title = String(body?.title || "").trim();
      const content = String(body?.content || "").trim();

      if (!propertyId) {
        return NextResponse.json({ error: "Missing property." }, { status: 400 });
      }

      const { data: property, error: propertyError } = await serviceClient
        .from("properties")
        .select("id")
        .eq("id", propertyId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (propertyError) throw propertyError;
      if (!property) {
        return NextResponse.json({ error: "Property not found in this organization." }, { status: 404 });
      }

      const { data: sop, error: sopError } = await serviceClient
        .from("property_sops")
        .insert({
          property_id: propertyId,
          title: title || null,
          content: content || null,
        })
        .select("*")
        .single();

      if (sopError || !sop) {
        return NextResponse.json(
          { error: sopError?.message || "Could not save SOP." },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, sop });
    }

    if (action === "add-image") {
      const sopId = String(body?.sopId || "").trim();
      const imageUrl = String(body?.imageUrl || "").trim();
      const caption = String(body?.caption || "").trim();
      const sortOrderRaw = Number(body?.sortOrder ?? 0);
      const sortOrder = Number.isFinite(sortOrderRaw) ? sortOrderRaw : 0;

      if (!sopId || !imageUrl) {
        return NextResponse.json({ error: "Missing SOP image details." }, { status: 400 });
      }

      const { data: sop, error: sopError } = await serviceClient
        .from("property_sops")
        .select("id, property_id")
        .eq("id", sopId)
        .maybeSingle();

      if (sopError) throw sopError;
      if (!sop) {
        return NextResponse.json({ error: "SOP not found." }, { status: 404 });
      }

      const { data: property, error: propertyError } = await serviceClient
        .from("properties")
        .select("id")
        .eq("id", sop.property_id)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (propertyError) throw propertyError;
      if (!property) {
        return NextResponse.json({ error: "SOP is outside this organization." }, { status: 403 });
      }

      const { data: image, error: imageError } = await serviceClient
        .from("property_sop_images")
        .insert({
          sop_id: sopId,
          image_url: imageUrl,
          caption: caption || null,
          sort_order: sortOrder,
        })
        .select("*")
        .single();

      if (imageError || !image) {
        return NextResponse.json(
          { error: imageError?.message || "Could not save SOP image." },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, image });
    }

    return NextResponse.json({ error: "Unknown SOP action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save SOP." },
      { status: 500 }
    );
  }
}
