import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MAX_CANCEL_AGE_HOURS = 24;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!userId || !email) {
      return NextResponse.json(
        { error: "Missing pending signup details." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing server environment variables." },
        { status: 500 }
      );
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authUser, error: authUserError } = await service.auth.admin.getUserById(userId);

    if (authUserError || !authUser.user) {
      return NextResponse.json(
        { error: "Could not find that pending signup." },
        { status: 404 }
      );
    }

    const user = authUser.user;
    const userEmail = user.email?.trim().toLowerCase() || "";

    if (userEmail !== email) {
      return NextResponse.json(
        { error: "Pending signup details do not match." },
        { status: 403 }
      );
    }

    if (user.email_confirmed_at || user.confirmed_at) {
      return NextResponse.json(
        { error: "This email has already been confirmed. Please log in or contact support." },
        { status: 409 }
      );
    }

    const createdAtMs = user.created_at ? new Date(user.created_at).getTime() : 0;
    const ageHours = createdAtMs ? (Date.now() - createdAtMs) / (1000 * 60 * 60) : Infinity;

    if (ageHours > MAX_CANCEL_AGE_HOURS) {
      return NextResponse.json(
        { error: "This pending signup is too old to cancel automatically. Please contact support." },
        { status: 409 }
      );
    }

    const { data: organizations, error: organizationsError } = await service
      .from("organizations")
      .select("id")
      .eq("created_by", userId);

    if (organizationsError) {
      return NextResponse.json({ error: organizationsError.message }, { status: 500 });
    }

    const organizationIds = organizations?.map((organization) => organization.id) || [];

    if (organizationIds.length) {
      const { error: membershipDeleteError } = await service
        .from("organization_members")
        .delete()
        .in("organization_id", organizationIds);

      if (membershipDeleteError) {
        return NextResponse.json({ error: membershipDeleteError.message }, { status: 500 });
      }

      const { error: organizationDeleteError } = await service
        .from("organizations")
        .delete()
        .in("id", organizationIds);

      if (organizationDeleteError) {
        return NextResponse.json({ error: organizationDeleteError.message }, { status: 500 });
      }
    }

    await service.from("organization_members").delete().eq("profile_id", userId);
    await service.from("profiles").delete().eq("id", userId);

    const { error: deleteUserError } = await service.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      return NextResponse.json({ error: deleteUserError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not cancel pending signup.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
