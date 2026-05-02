import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createInvoicePdfBuffer, type InvoicePdfLineItem } from "@/lib/server/invoice-pdf";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type InvoiceTaxLine = {
  id: string;
  label: string;
  rate: number;
  amount: number;
};

function normalizeTaxLines(invoice: any) {
  const subtotal = Number(invoice.subtotal || 0);
  const rows = Array.isArray(invoice.tax_lines) ? invoice.tax_lines : [];

  return rows
    .map((line: any, index: number) => {
      const rawLabel = String(line?.label || "").trim();
      const rate = Math.max(Number(line?.rate || 0), 0);
      return {
        id: String(line?.id || `tax-${index + 1}`),
        label: rawLabel || "Tax",
        rate,
        amount: typeof line?.amount === "number"
          ? Number(line.amount)
          : Math.round(subtotal * (rate / 100) * 100) / 100,
        hasValue: !!rawLabel || rate > 0,
      };
    })
    .filter((line: InvoiceTaxLine & { hasValue: boolean }) => line.hasValue)
    .map(({ hasValue: _hasValue, ...line }: InvoiceTaxLine & { hasValue: boolean }) => line);
}

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
    const invoiceId = String(body?.invoiceId || "").trim();

    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice is required." }, { status: 400 });
    }

    const service = createClient(supabaseUrl, serviceRoleKey);
    const ownerEmail = user.email.trim().toLowerCase();

    const { data: owner, error: ownerError } = await service
      .from("owner_accounts")
      .select("id,email,full_name")
      .eq("email", ownerEmail)
      .maybeSingle();

    if (ownerError) {
      return NextResponse.json({ error: ownerError.message }, { status: 500 });
    }

    if (!owner) {
      return NextResponse.json({ error: "Owner account not found." }, { status: 404 });
    }

    const { data: invoice, error: invoiceError } = await service
      .from("owner_invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("owner_account_id", owner.id)
      .in("status", ["sent", "paid"])
      .maybeSingle();

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    }

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const { data: property } = invoice.property_id
      ? await service
          .from("properties")
          .select("id,name,address")
          .eq("id", invoice.property_id)
          .maybeSingle()
      : { data: null };

    const lineItems = Array.isArray(invoice.line_items)
      ? (invoice.line_items as InvoicePdfLineItem[])
      : [];

    const pdfBuffer = await createInvoicePdfBuffer({
      invoiceNumber: invoice.invoice_number,
      companyName: invoice.company_name || "Property invoice",
      logoUrl: invoice.logo_url || null,
      ownerName: owner.full_name || owner.email,
      ownerEmail: owner.email,
      propertyName: property?.name || property?.address || "All linked properties",
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date || null,
      headerText: invoice.header_text || null,
      notes: invoice.notes || null,
      paymentInstructions: invoice.payment_instructions || null,
      subtotal: Number(invoice.subtotal || 0),
      taxLines: normalizeTaxLines(invoice),
      taxTotal: Number(invoice.tax_total || 0),
      total: Number(invoice.total || 0),
      lineItems,
    });

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${invoice.invoice_number}.pdf`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
