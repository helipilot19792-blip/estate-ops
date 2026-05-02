import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

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

type InvoiceLineItem = {
  description?: string | null;
  category?: string | null;
  quantity?: number | string | null;
  rate?: number | string | null;
};

type InvoicePdfInput = {
  invoiceNumber: string;
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  propertyName: string;
  issueDate: string;
  dueDate: string | null;
  headerText: string | null;
  notes: string | null;
  paymentInstructions: string | null;
  total: number;
  lineItems: InvoiceLineItem[];
};

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapPdfText(value: string, maxLength = 86) {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function buildPdfContentLine(text: string, x: number, y: number, size = 10) {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function createInvoicePdfBuffer(input: InvoicePdfInput) {
  const pages: string[] = [];
  let y = 760;
  let lines: string[] = [];

  function pushLine(text: string, size = 10, x = 50, gap = 16) {
    if (y < 60) {
      pages.push(lines.join("\n"));
      lines = [];
      y = 760;
    }

    lines.push(buildPdfContentLine(text, x, y, size));
    y -= gap;
  }

  pushLine(input.companyName, 18, 50, 24);
  pushLine(`Invoice ${input.invoiceNumber}`, 14, 50, 22);
  pushLine(`Owner: ${input.ownerName} <${input.ownerEmail}>`, 10);
  pushLine(`Property: ${input.propertyName}`, 10);
  pushLine(`Issue date: ${input.issueDate}`, 10);
  if (input.dueDate) pushLine(`Due date: ${input.dueDate}`, 10);

  if (input.headerText) {
    y -= 8;
    for (const line of wrapPdfText(input.headerText)) {
      pushLine(line, 10);
    }
  }

  y -= 12;
  pushLine("Description", 11, 50, 14);
  pushLine("Qty        Rate          Amount", 11, 390, 18);

  for (const item of input.lineItems) {
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    const amount = quantity * rate;
    const description = String(item.description || "Invoice item");
    const firstLine = wrapPdfText(description, 54)[0] || description;
    pushLine(firstLine, 10, 50, 14);
    pushLine(`${quantity}        ${formatCurrency(rate)}        ${formatCurrency(amount)}`, 10, 390, 16);

    for (const extraLine of wrapPdfText(description, 54).slice(1)) {
      pushLine(extraLine, 9, 62, 13);
    }
  }

  y -= 10;
  pushLine(`Total: ${formatCurrency(input.total)}`, 14, 390, 24);

  if (input.notes) {
    pushLine("Notes", 11, 50, 16);
    for (const line of wrapPdfText(input.notes)) pushLine(line, 10);
  }

  if (input.paymentInstructions) {
    pushLine("Payment", 11, 50, 16);
    for (const line of wrapPdfText(input.paymentInstructions)) pushLine(line, 10);
  }

  pages.push(lines.join("\n"));

  const objects: string[] = [];
  const pageRefs: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const content of pages) {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = pageObjectNumber + 1;
    pageRefs.push(pageObjectNumber);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
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

    const lineItems = Array.isArray(invoice.line_items)
      ? (invoice.line_items as InvoiceLineItem[])
      : [];
    const rows = lineItems
      .map((item) => {
        const quantity = Number(item.quantity || 0);
        const rate = Number(item.rate || 0);
        return `
          <tr>
            <td style="padding:10px;border-bottom:1px solid #eadfce;">${escapeHtml(item.description)}</td>
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
        <div style="text-align:right;font-size:20px;font-weight:700;">Total ${formatCurrency(invoice.total)}</div>
        ${invoice.notes ? `<p style="margin-top:18px;color:#5f5245;">${escapeHtml(invoice.notes)}</p>` : ""}
        ${invoice.payment_instructions ? `<p style="margin-top:18px;"><strong>Payment:</strong> ${escapeHtml(invoice.payment_instructions)}</p>` : ""}
        <p style="margin-top:22px;font-size:12px;color:#8a7b68;">You can also view this invoice inside your owner portal.</p>
      </div>
    `;

    const pdfBuffer = createInvoicePdfBuffer({
      invoiceNumber: invoice.invoice_number,
      companyName: invoice.company_name || "Property invoice",
      ownerName: owner.full_name || owner.email,
      ownerEmail: owner.email,
      propertyName: property?.name || property?.address || "All linked properties",
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date || null,
      headerText: invoice.header_text || null,
      notes: invoice.notes || null,
      paymentInstructions: invoice.payment_instructions || null,
      total: Number(invoice.total || 0),
      lineItems,
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: process.env.INVITE_FROM_EMAIL,
      to: owner.email,
      subject: `Invoice ${invoice.invoice_number} from ${invoice.company_name || "your property manager"}`,
      html,
      attachments: [
        {
          filename: `${invoice.invoice_number}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
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
