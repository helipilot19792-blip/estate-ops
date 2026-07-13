import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { formatCurrency, normalizeCurrencyCode } from "@/lib/currency";

// Supabase generated types are not available for this project's new optional tables yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = any;

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatSender(fromEmail: string, companyName: string | null | undefined) {
  const email = fromEmail.trim();
  const name = String(companyName || "Property invoice").replace(/"/g, "");
  return name ? `${name} <${email}>` : email;
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

export function getOwnerInvoiceReminderServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function insertInvoiceEvent(
  service: ServiceClient,
  payload: {
    organization_id: string;
    invoice_id: string;
    event_type: string;
    recipient_email?: string | null;
    cc_emails?: string[];
    resend_email_id?: string | null;
    actor_profile_id?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await service.from("owner_invoice_events").insert({
    ...payload,
    cc_emails: payload.cc_emails ?? [],
    metadata: payload.metadata ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function recordOwnerInvoiceEvent(
  service: ServiceClient,
  payload: {
    organization_id: string;
    invoice_id: string;
    event_type: "invoice_sent" | "invoice_resent" | "marked_paid" | "marked_unpaid";
    recipient_email?: string | null;
    cc_emails?: string[];
    resend_email_id?: string | null;
    actor_profile_id?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await insertInvoiceEvent(service, payload);
}

export async function sendOwnerInvoiceReminderEmail(options: {
  service?: ServiceClient;
  invoiceId: string;
  origin: string;
  actorProfileId?: string | null;
  ccEmails?: string[] | string;
  eventType?: "reminder_sent" | "auto_reminder_sent";
}) {
  if (!process.env.RESEND_API_KEY || !process.env.INVITE_FROM_EMAIL) {
    throw new Error("Email environment is incomplete.");
  }

  const service = options.service ?? getOwnerInvoiceReminderServiceClient();
  const { data: invoice, error: invoiceError } = await service
    .from("owner_invoices")
    .select("*")
    .eq("id", options.invoiceId)
    .maybeSingle();

  if (invoiceError) throw new Error(invoiceError.message);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== "sent") throw new Error("Only sent unpaid invoices can receive reminders.");

  const { data: owner, error: ownerError } = await service
    .from("owner_accounts")
    .select("id,email,full_name")
    .eq("id", invoice.owner_account_id)
    .maybeSingle();

  if (ownerError) throw new Error(ownerError.message);
  if (!owner?.email) throw new Error("Owner email not found.");

  const { data: property } = invoice.property_id
    ? await service
        .from("properties")
        .select("id,name,address")
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

  if (!fromEmail) throw new Error("Invoice sender email is not configured.");

  const ccEmails = parseEmailList(options.ccEmails);
  const ownerPortalUrl = `${options.origin}/owner?tab=invoices`;
  const dueLine = invoice.due_date
    ? `<div><strong>Due date:</strong> ${escapeHtml(invoice.due_date)}</div>`
    : "";
  const propertyLine = property?.name || property?.address || "All linked properties";
  const companyName = invoice.company_name || "your property manager";
  const currencyCode = normalizeCurrencyCode(invoice.currency_code);
  const html = `
    <div style="font-family:Arial,sans-serif;color:#241c15;line-height:1.5;padding:20px;">
      ${invoice.logo_url ? `<img src="${escapeHtml(invoice.logo_url)}" alt="" style="max-height:72px;margin-bottom:16px;" />` : ""}
      <h1 style="margin:0 0 8px;font-size:24px;">Invoice reminder</h1>
      <p style="margin:0 0 18px;color:#5f5245;">This is a friendly reminder that invoice ${escapeHtml(invoice.invoice_number)} is still outstanding.</p>
      <div style="margin-bottom:18px;padding:14px;border:1px solid #eadfce;border-radius:14px;background:#fcfaf7;">
        <div><strong>Owner:</strong> ${escapeHtml(owner.full_name || owner.email)}</div>
        <div><strong>Property:</strong> ${escapeHtml(propertyLine)}</div>
        <div><strong>Invoice:</strong> ${escapeHtml(invoice.invoice_number)}</div>
        ${dueLine}
        <div><strong>Amount due:</strong> ${formatCurrency(invoice.total, currencyCode)}</div>
      </div>
      ${invoice.payment_instructions ? `<p style="margin:0 0 18px;"><strong>Payment:</strong> ${escapeHtml(invoice.payment_instructions)}</p>` : ""}
      <p style="margin:0 0 18px;color:#5f5245;">Please log in to your owner portal to view or download the invoice.</p>
      <a href="${escapeHtml(ownerPortalUrl)}" style="display:inline-block;padding:10px 16px;background:#241c15;color:#ffffff;border-radius:999px;text-decoration:none;font-weight:700;">
        Open owner portal
      </a>
      <p style="margin:12px 0 0;font-size:12px;color:#8a7b68;word-break:break-all;">
        ${escapeHtml(ownerPortalUrl)}
      </p>
    </div>
  `;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: formatSender(fromEmail, invoice.company_name),
    to: owner.email,
    cc: ccEmails.length > 0 ? ccEmails : undefined,
    replyTo: replyToEmail || undefined,
    subject: `Reminder: Invoice ${invoice.invoice_number} from ${companyName}`,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message || "Invoice reminder email failed.");
  }

  const now = new Date().toISOString();
  const nextReminderCount = Number(invoice.reminder_count || 0) + 1;
  const { error: updateError } = await service
    .from("owner_invoices")
    .update({
      last_reminder_sent_at: now,
      reminder_count: nextReminderCount,
      updated_at: now,
    })
    .eq("id", invoice.id);

  if (updateError) throw new Error(updateError.message);

  await insertInvoiceEvent(service, {
    organization_id: invoice.organization_id,
    invoice_id: invoice.id,
    event_type: options.eventType || "reminder_sent",
    recipient_email: owner.email,
    cc_emails: ccEmails,
    resend_email_id: result.data?.id ?? null,
    actor_profile_id: options.actorProfileId || null,
    metadata: {
      invoice_number: invoice.invoice_number,
      total: Number(invoice.total || 0),
      reminder_count: nextReminderCount,
    },
  });

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    emailId: result.data?.id ?? null,
    reminderCount: nextReminderCount,
    recipientEmail: owner.email,
  };
}
