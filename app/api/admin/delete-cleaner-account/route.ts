import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    if (
      currentProfileError ||
      !currentProfile ||
      (currentProfile.role !== "admin" && currentProfile.role !== "platform_admin")
    ) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const cleanerAccountId =
      typeof body?.cleanerAccountId === "string" ? body.cleanerAccountId.trim() : "";

    if (!cleanerAccountId) {
      return NextResponse.json(
        { error: "Missing cleanerAccountId." },
        { status: 400 }
      );
    }

    const { data: cleanerAccount, error: cleanerAccountError } = await service
      .from("cleaner_accounts")
      .select("id, organization_id")
      .eq("id", cleanerAccountId)
      .maybeSingle();

    if (cleanerAccountError) {
      return NextResponse.json(
        { error: cleanerAccountError.message },
        { status: 500 }
      );
    }

    if (!cleanerAccount?.organization_id) {
      return NextResponse.json(
        { error: "Cleaner account not found." },
        { status: 404 }
      );
    }

    const { data: membership, error: membershipError } = await service
      .from("organization_members")
      .select("organization_id, role")
      .eq("organization_id", cleanerAccount.organization_id)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "You do not have admin access to this organization." },
        { status: 403 }
      );
    }

    const { error: membersError } = await service
      .from("cleaner_account_members")
      .delete()
      .eq("cleaner_account_id", cleanerAccountId);

    if (membersError) {
      return NextResponse.json(
        { error: membersError.message },
        { status: 500 }
      );
    }

    const { error: accountError } = await service
      .from("cleaner_accounts")
      .delete()
      .eq("id", cleanerAccountId);

    if (accountError) {
      return NextResponse.json(
        { error: accountError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
