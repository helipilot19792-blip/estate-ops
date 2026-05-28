import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedSources = new Set(["airbnb", "vrbo"]);

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
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

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
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();
    const rows = Array.isArray(body?.calendars) ? body.calendars : [];

    if (!organizationId || !propertyId) {
      return NextResponse.json({ error: "Missing property calendar details." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const isAdmin = await verifyAdmin(serviceClient, user.id, organizationId);
    if (!isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: property, error: propertyError } = await serviceClient
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 });
    }

    if (!property) {
      return NextResponse.json({ error: "Property not found in this organization." }, { status: 404 });
    }

    const normalizedRows = rows
      .map((row: any) => ({
        id: typeof row?.id === "string" ? row.id.trim() : "",
        source: String(row?.source || "").trim().toLowerCase(),
        ical_url: String(row?.ical_url || "").trim(),
        is_active: row?.is_active !== false,
      }))
      .filter((row: any) => row.source || row.ical_url);

    for (const row of normalizedRows) {
      if (!row.source) {
        return NextResponse.json({ error: "Each calendar row needs a source." }, { status: 400 });
      }
      if (!allowedSources.has(row.source)) {
        return NextResponse.json({ error: "Calendar source must be Airbnb or VRBO." }, { status: 400 });
      }
      if (!row.ical_url) {
        return NextResponse.json({ error: "Each calendar row needs an iCal URL." }, { status: 400 });
      }
    }

    const { data: existingRows, error: existingRowsError } = await serviceClient
      .from("property_calendars")
      .select("id")
      .eq("property_id", propertyId);

    if (existingRowsError) {
      return NextResponse.json({ error: existingRowsError.message }, { status: 500 });
    }

    const existingIds = new Set((existingRows || []).map((row: any) => row.id));
    const draftIds = new Set(normalizedRows.map((row: any) => row.id).filter(Boolean));
    const idsToDelete = [...existingIds].filter((id) => !draftIds.has(id));

    if (idsToDelete.length > 0) {
      const { error: deleteError } = await serviceClient
        .from("property_calendars")
        .delete()
        .eq("property_id", propertyId)
        .in("id", idsToDelete);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
    }

    for (const row of normalizedRows) {
      if (row.id && existingIds.has(row.id)) {
        const { error: updateError } = await serviceClient
          .from("property_calendars")
          .update({
            source: row.source,
            ical_url: row.ical_url,
            is_active: row.is_active,
          })
          .eq("id", row.id)
          .eq("property_id", propertyId);

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
        continue;
      }

      const { error: insertError } = await serviceClient
        .from("property_calendars")
        .insert({
          property_id: propertyId,
          source: row.source,
          ical_url: row.ical_url,
          is_active: row.is_active,
        });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    const { data: savedCalendars, error: savedError } = await serviceClient
      .from("property_calendars")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (savedError) {
      return NextResponse.json({ error: savedError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, calendars: savedCalendars || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save property calendars." },
      { status: 500 }
    );
  }
}
