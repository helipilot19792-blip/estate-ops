import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    const bookingEventId = String(body?.bookingEventId || "").trim();
    const noteText = String(body?.adminNote || "").trim();
    const noteImportant = Boolean(body?.adminNoteImportant);

    if (!organizationId || !bookingEventId) {
      return NextResponse.json({ error: "Missing organization or booking." }, { status: 400 });
    }

    if (noteText.length > 1000) {
      return NextResponse.json({ error: "Booking note must be 1000 characters or less." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
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
        return NextResponse.json({ error: membershipError.message }, { status: 500 });
      }

      if (!membership) {
        return NextResponse.json({ error: "Admin access required for this organization." }, { status: 403 });
      }
    }

    const { data: existingBooking, error: bookingError } = await serviceClient
      .from("property_booking_events")
      .select("id")
      .eq("id", bookingEventId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (bookingError) {
      return NextResponse.json({ error: bookingError.message }, { status: 500 });
    }

    if (!existingBooking) {
      return NextResponse.json({ error: "Booking not found for this organization." }, { status: 404 });
    }

    const { data: bookingEvent, error: updateError } = await serviceClient
      .from("property_booking_events")
      .update({
        admin_note: noteText || null,
        admin_note_important: noteText ? noteImportant : false,
      })
      .eq("id", bookingEventId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, bookingEvent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save booking note." },
      { status: 500 }
    );
  }
}
