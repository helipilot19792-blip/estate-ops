import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createInvoicePdfBuffer, type InvoicePdfLineItem } from "@/lib/server/invoice-pdf";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

function getLineItemTotal(item: InvoicePdfLineItem) {
  return Number(item.quantity || 0) * Number(item.rate || 0);
}

function normalizeTaxLines(value: unknown, subtotal: number, fallbackRate: number) {
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows
    .map((line: any, index) => {
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
    .filter((line) => line.hasValue)
    .map(({ hasValue, ...line }) => line);

  if (normalized.length > 0) return normalized;

  const rate = Math.max(fallbackRate, 0);
  return rate > 0
    ? [{ id: "tax-1", label: "Tax", rate, amount: Math.round(subtotal * (rate / 100) * 100) / 100 }]
    : [];
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !publicSupabaseKey) {
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

    const body = await request.json();
    const lineItems = Array.isArray(body?.lineItems)
      ? (body.lineItems as InvoicePdfLineItem[])
      : [];
    const subtotal =
      typeof body?.subtotal === "number"
        ? Number(body.subtotal)
        : lineItems.reduce((sum, item) => sum + getLineItemTotal(item), 0);
    const taxRate = Math.max(Number(body?.taxRate || 0), 0);
    const taxLines = normalizeTaxLines(body?.taxLines, subtotal, taxRate);
    const taxTotal =
      typeof body?.taxTotal === "number"
        ? Number(body.taxTotal)
        : taxLines.reduce((sum, line) => sum + line.amount, 0);
    const total =
      typeof body?.total === "number"
        ? Number(body.total)
        : subtotal + taxTotal;

    const pdfBuffer = await createInvoicePdfBuffer({
      invoiceNumber: String(body?.invoiceNumber || "PREVIEW"),
      companyName: String(body?.companyName || "Property invoice"),
      logoUrl: body?.logoUrl ? String(body.logoUrl) : null,
      ownerName: String(body?.ownerName || "Owner"),
      ownerEmail: String(body?.ownerEmail || ""),
      propertyName: String(body?.propertyName || "All linked properties"),
      issueDate: String(body?.issueDate || new Date().toISOString().slice(0, 10)),
      dueDate: body?.dueDate ? String(body.dueDate) : null,
      headerText: body?.headerText ? String(body.headerText) : null,
      notes: body?.notes ? String(body.notes) : null,
      paymentInstructions: body?.paymentInstructions ? String(body.paymentInstructions) : null,
      subtotal,
      taxLines,
      taxTotal,
      total,
      lineItems,
    });

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=invoice-preview.pdf",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
