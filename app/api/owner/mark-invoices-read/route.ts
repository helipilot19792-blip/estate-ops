import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Supabase environment is incomplete." }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const ownerClient = createClient(supabaseUrl, publicSupabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await ownerClient.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const invoiceIds = Array.isArray(body?.invoiceIds)
      ? body.invoiceIds.map((id: unknown) => String(id || "").trim()).filter(Boolean)
      : [];

    if (invoiceIds.length === 0) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    const service = createClient(supabaseUrl, serviceRoleKey);
    const ownerEmail = user.email.trim().toLowerCase();

    const { data: owner, error: ownerError } = await service
      .from("owner_accounts")
      .select("id,email")
      .eq("email", ownerEmail)
      .maybeSingle();

    if (ownerError) {
      return NextResponse.json({ error: ownerError.message }, { status: 500 });
    }

    if (!owner) {
      return NextResponse.json({ error: "Owner account not found." }, { status: 404 });
    }

    const { error: updateError } = await service
      .from("owner_invoices")
      .update({ owner_viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("owner_account_id", owner.id)
      .in("id", invoiceIds)
      .is("owner_viewed_at", null);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated: invoiceIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
