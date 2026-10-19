import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseStorageReference } from "@/lib/storage-reference";
import { getFreshReceiptUrl } from "@/lib/receipt-asset-url";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !publicKey || !serviceRoleKey) {
      return reply({ error: "Receipt service is unavailable." }, 503);
    }
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return reply({ error: "Please sign in again to open this receipt." }, 401);

    const ownerClient = createClient(supabaseUrl, publicKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await ownerClient.auth.getUser();
    if (authError || !user?.email) {
      return reply({ error: "Please sign in again to open this receipt." }, 401);
    }
    const body = await request.json().catch(() => null);
    const { invoiceId, lineItemIndex, receiptIndex } = body || {};
    if (typeof invoiceId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(invoiceId)
      || !Number.isSafeInteger(lineItemIndex) || lineItemIndex < 0
      || !Number.isSafeInteger(receiptIndex) || receiptIndex < 0) {
      return reply({ error: "A valid invoice and receipt are required." }, 400);
    }

    // Read through the caller's existing invoice RLS before using privileged storage.
    const { data: invoice, error: invoiceError } = await ownerClient
      .from("owner_invoices")
      .select("id,organization_id,owner_account_id,line_items")
      .eq("id", invoiceId)
      .in("status", ["sent", "paid"])
      .maybeSingle();
    if (invoiceError) return reply({ error: "Could not verify receipt access. Please try again." }, 500);
    if (!invoice) return reply({ error: "Receipt not found." }, 404);

    const { data: owner, error: ownerError } = await ownerClient
      .from("owner_accounts")
      .select("id")
      .eq("id", invoice.owner_account_id)
      .eq("organization_id", invoice.organization_id)
      .eq("email", user.email.trim().toLowerCase())
      .eq("is_active", true)
      .maybeSingle();
    if (ownerError) return reply({ error: "Could not verify receipt access. Please try again." }, 500);
    if (!owner) return reply({ error: "Receipt not found." }, 404);

    // The browser supplies indices, never an arbitrary object path to sign.
    const items = Array.isArray(invoice.line_items) ? invoice.line_items : [];
    const receipts = items[lineItemIndex]?.receipt_urls;
    const value = Array.isArray(receipts) ? receipts[receiptIndex] : null;
    if (typeof value !== "string" || !value.trim()) return reply({ error: "Receipt not found." }, 404);
    const reference = parseStorageReference(value);
    if (reference) {
      const segments = decodeURIComponent(reference.path).replace(/\\/g, "/").split("/");
      if (reference.bucket !== "invoice-assets" || segments[0] !== invoice.organization_id
        || segments.some((segment) => segment === "." || segment === "..")) {
        return reply({ error: "Receipt not found." }, 404);
      }
    }

    try {
      const service = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      return reply({ url: await getFreshReceiptUrl(service.storage, value) });
    } catch {
      return reply({ error: "The receipt file could not be opened. Please try again or contact your property manager." }, 502);
    }
  } catch {
    return reply({ error: "Could not open the receipt. Please try again." }, 500);
  }
}
