import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getOwnerInvoiceReminderServiceClient,
  sendOwnerInvoiceReminderEmail,
} from "@/lib/server/owner-invoice-reminders";

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicSupabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !publicSupabaseKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Supabase environment is incomplete." }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const adminClient = createClient(supabaseUrl, publicSupabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      (profile.role !== "admin" && profile.role !== "platform_admin")
    ) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const invoiceId = String(body?.invoiceId || "").trim();

    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice is required." }, { status: 400 });
    }

    const service = getOwnerInvoiceReminderServiceClient();
    const { data: invoice, error: invoiceError } = await service
      .from("owner_invoices")
      .select("id, organization_id")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    }

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    if (profile.role !== "platform_admin") {
      const { data: membership, error: membershipError } = await service
        .from("organization_members")
        .select("organization_id, role")
        .eq("organization_id", invoice.organization_id)
        .eq("profile_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (membershipError) {
        return NextResponse.json({ error: membershipError.message }, { status: 500 });
      }

      if (!membership) {
        return NextResponse.json({ error: "You do not have access to this invoice." }, { status: 403 });
      }
    }

    const result = await sendOwnerInvoiceReminderEmail({
      service,
      invoiceId,
      origin: request.nextUrl.origin,
      actorProfileId: profile.id,
      ccEmails: body?.ccEmails,
      eventType: "reminder_sent",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send invoice reminder." },
      { status: 500 }
    );
  }
}
