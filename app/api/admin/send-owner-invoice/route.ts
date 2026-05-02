import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createInvoicePdfBuffer } from "@/lib/server/invoice-pdf";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseEmailList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim().toLowerCase())
      .filter((item) => item.includes("@"));
  }

  return String(value || "")
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes("@"));
}

function formatSender(fromEmail: string, companyName: string | null | undefined) {
  const email = fromEmail.trim();
  const name = String(companyName || "Property invoice").replace(/"/g, "");
  return name ? `${name} <${email}>` : email;
}

type InvoiceLineItem = {
  description?: string | null;
  category?: string | null;
  quantity?: number | string | null;
  rate?: number | string | null;
  receipt_urls?: string[] | null;
  receipt_names?: string[] | null;
};

type InvoiceTaxLine = {
  id: string;
  label: string;
  rate: number;
  amount: number;
};

function normalizeTaxLines(invoice: any): InvoiceTaxLine[] {
  const subtotal = Number(invoice.subtotal || 0);
  const rows = Array.isArray(invoice.tax_lines) ? invoice.tax_lines : [];
  const normalized = rows
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

  if (normalized.length > 0) return normalized;

  return [];
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Supabase environment is incomplete." }, { status: 500 });
    }

    if (!process.env.RESEND_API_KEY || !process.env.INVITE_FROM_EMAIL) {
      return NextResponse.json({ error: "Email environment is incomplete." }, { status: 500 });
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
      .select("id, role, email")
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
    const invoiceId = String(body?.invoiceId || "").trim();
    const ccEmails = parseEmailList(body?.ccEmails);

    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice is required." }, { status: 400 });
    }

    const service = createClient(supabaseUrl, serviceRoleKey);
    const { data: invoice, error: invoiceError } = await service
      .from("owner_invoices")
      .select("*")
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

    const { data: owner, error: ownerError } = await service
      .from("owner_accounts")
      .select("id, email, full_name")
      .eq("id", invoice.owner_account_id)
      .maybeSingle();

    if (ownerError || !owner?.email) {
      return NextResponse.json({ error: ownerError?.message || "Owner email not found." }, { status: 500 });
    }

    const { data: property } = invoice.property_id
      ? await service
          .from("properties")
          .select("id, name, address")
          .eq("id", invoice.property_id)
          .maybeSingle()
      : { data: null };

    const { data: settings } = await service
      .from("organization_invoice_settings")
      .select("from_email, reply_to_email")
      .eq("organization_id", invoice.organization_id)
      .maybeSingle();

    const fromEmail =
      String(invoice.from_email || settings?.from_email || process.env.INVITE_FROM_EMAIL || "").trim();
    const replyToEmail =
      String(invoice.reply_to_email || settings?.reply_to_email || fromEmail || "").trim();

    if (!fromEmail) {
      return NextResponse.json({ error: "Invoice sender email is not configured." }, { status: 500 });
    }

    const lineItems = Array.isArray(invoice.line_items)
      ? (invoice.line_items as InvoiceLineItem[])
      : [];
    const taxLines = normalizeTaxLines(invoice);
    const rows = lineItems
      .map((item) => {
        const quantity = Number(item.quantity || 0);
        const rate = Number(item.rate || 0);
        const receiptLinks = (item.receipt_urls || [])
          .map((url, index) => {
            const label = item.receipt_names?.[index] || `Receipt ${index + 1}`;
            return `<a href="${escapeHtml(url)}" style="color:#7d581b;">${escapeHtml(label)}</a>`;
          })
          .join("<br />");
        return `
          <tr>
            <td style="padding:10px;border-bottom:1px solid #eadfce;">
              ${escapeHtml(item.description)}
              ${receiptLinks ? `<div style="margin-top:6px;font-size:12px;">${receiptLinks}</div>` : ""}
            </td>
            <td style="padding:10px;border-bottom:1px solid #eadfce;text-align:right;">${quantity}</td>
            <td style="padding:10px;border-bottom:1px solid #eadfce;text-align:right;">${formatCurrency(rate)}</td>
            <td style="padding:10px;border-bottom:1px solid #eadfce;text-align:right;">${formatCurrency(quantity * rate)}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;color:#241c15;line-height:1.5;padding:20px;">
        ${invoice.logo_url ? `<img src="${escapeHtml(invoice.logo_url)}" alt="" style="max-height:72px;margin-bottom:16px;" />` : ""}
        <h1 style="margin:0 0 4px;font-size:24px;">${escapeHtml(invoice.company_name || "Property invoice")}</h1>
        <p style="margin:0 0 16px;color:#6f6255;">Invoice ${escapeHtml(invoice.invoice_number)}</p>
        ${invoice.header_text ? `<p style="margin:0 0 18px;">${escapeHtml(invoice.header_text)}</p>` : ""}
        <div style="margin-bottom:18px;padding:14px;border:1px solid #eadfce;border-radius:14px;background:#fcfaf7;">
          <div><strong>Owner:</strong> ${escapeHtml(owner.full_name || owner.email)}</div>
          <div><strong>Property:</strong> ${escapeHtml(property?.name || property?.address || "All linked properties")}</div>
          <div><strong>Issue date:</strong> ${escapeHtml(invoice.issue_date)}</div>
          ${invoice.due_date ? `<div><strong>Due date:</strong> ${escapeHtml(invoice.due_date)}</div>` : ""}
        </div>
        <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
          <thead>
            <tr style="background:#f7f3ee;">
              <th style="padding:10px;text-align:left;">Description</th>
              <th style="padding:10px;text-align:right;">Qty</th>
              <th style="padding:10px;text-align:right;">Rate</th>
              <th style="padding:10px;text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-left:auto;width:280px;font-size:14px;">
          <div style="display:flex;justify-content:space-between;padding:4px 0;">
            <span>Subtotal</span><span>${formatCurrency(invoice.subtotal)}</span>
          </div>
          ${taxLines
            .map((line: InvoiceTaxLine) => `<div style="display:flex;justify-content:space-between;padding:4px 0;">
              <span>${escapeHtml(line.label)} (${line.rate}%)</span><span>${formatCurrency(line.amount)}</span>
            </div>`)
            .join("")}
          <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:20px;font-weight:700;">
            <span>Total</span><span>${formatCurrency(invoice.total)}</span>
          </div>
        </div>
        ${invoice.notes ? `<p style="margin-top:18px;color:#5f5245;">${escapeHtml(invoice.notes)}</p>` : ""}
        ${invoice.payment_instructions ? `<p style="margin-top:18px;"><strong>Payment:</strong> ${escapeHtml(invoice.payment_instructions)}</p>` : ""}
        <p style="margin-top:22px;font-size:12px;color:#8a7b68;">You can also view this invoice inside your owner portal.</p>
      </div>
    `;

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
      taxLines,
      taxTotal: Number(invoice.tax_total || 0),
      total: Number(invoice.total || 0),
      lineItems,
    });
    const receiptAttachments = lineItems.flatMap((item, itemIndex) =>
      (item.receipt_urls || []).map((url, receiptIndex) => ({
        filename:
          item.receipt_names?.[receiptIndex]?.replace(/[^a-zA-Z0-9._-]/g, "_") ||
          `receipt-${itemIndex + 1}-${receiptIndex + 1}`,
        path: url,
      }))
    );

    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: formatSender(fromEmail, invoice.company_name),
      to: owner.email,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      replyTo: replyToEmail || undefined,
      subject: `Invoice ${invoice.invoice_number} from ${invoice.company_name || "your property manager"}`,
      html,
      attachments: [
        {
          filename: `${invoice.invoice_number}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
        ...receiptAttachments,
      ],
    });

    if (result.error) {
      return NextResponse.json({ error: result.error.message || "Invoice email failed." }, { status: 500 });
    }

    const { error: updateError } = await service
      .from("owner_invoices")
      .update({
        status: invoice.status === "draft" ? "sent" : invoice.status,
        sent_at: new Date().toISOString(),
        sent_by_profile_id: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: result.data?.id ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
