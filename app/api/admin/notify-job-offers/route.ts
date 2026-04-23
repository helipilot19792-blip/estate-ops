import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendJobOfferEmailsForSlots, type JobNotificationKind } from "@/lib/server/job-notifications";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing server environment variables." },
        { status: 500 }
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: currentProfile, error: currentProfileError } = await service
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (currentProfileError || !currentProfile || currentProfile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const kind = body?.kind as JobNotificationKind | undefined;
    const slotIds = Array.isArray(body?.slotIds) ? body.slotIds.filter(Boolean) : [];

    if ((kind !== "cleaner" && kind !== "grounds") || slotIds.length === 0) {
      return NextResponse.json(
        { error: "Missing valid kind or slotIds." },
        { status: 400 }
      );
    }

    const result = await sendJobOfferEmailsForSlots(kind, slotIds, req.nextUrl.origin);

    return NextResponse.json({
      success: true,
      kind,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 }
    );
  }
}

export {};
