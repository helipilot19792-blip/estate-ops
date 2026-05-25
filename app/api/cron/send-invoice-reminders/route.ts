import {
  getOwnerInvoiceReminderServiceClient,
  sendOwnerInvoiceReminderEmail,
} from "@/lib/server/owner-invoice-reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isDue(dateString: string | null | undefined, days: number, now: Date) {
  if (!dateString) return false;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  return addDays(date, Math.max(1, Number(days || 1))).getTime() <= now.getTime();
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const service = getOwnerInvoiceReminderServiceClient();
  const now = new Date();
  const origin = new URL(request.url).origin;
  const { data: settingsRows, error: settingsError } = await service
    .from("organization_invoice_settings")
    .select("organization_id, invoice_reminders_enabled, invoice_reminder_days_after_sent, invoice_reminder_repeat_days, invoice_reminder_max_count")
    .eq("invoice_reminders_enabled", true);

  if (settingsError) {
    return Response.json({ ok: false, error: settingsError.message }, { status: 500 });
  }

  let considered = 0;
  let sent = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const settings of settingsRows ?? []) {
    const maxCount = Math.max(1, Number(settings.invoice_reminder_max_count || 1));
    const { data: invoices, error: invoicesError } = await service
      .from("owner_invoices")
      .select("id, invoice_number, sent_at, last_reminder_sent_at, reminder_count")
      .eq("organization_id", settings.organization_id)
      .eq("status", "sent")
      .lt("reminder_count", maxCount);

    if (invoicesError) {
      errors.push(invoicesError.message);
      continue;
    }

    for (const invoice of invoices ?? []) {
      considered += 1;
      const reminderCount = Number(invoice.reminder_count || 0);
      const due = reminderCount === 0
        ? isDue(invoice.sent_at, Number(settings.invoice_reminder_days_after_sent || 15), now)
        : isDue(invoice.last_reminder_sent_at, Number(settings.invoice_reminder_repeat_days || 15), now);

      if (!due) {
        skipped.push(invoice.invoice_number || invoice.id);
        continue;
      }

      try {
        await sendOwnerInvoiceReminderEmail({
          service,
          invoiceId: invoice.id,
          origin,
          eventType: "auto_reminder_sent",
        });
        sent += 1;
      } catch (error) {
        errors.push(
          `${invoice.invoice_number || invoice.id}: ${error instanceof Error ? error.message : "Unknown reminder error."}`
        );
      }
    }
  }

  return Response.json({
    ok: true,
    considered,
    sent,
    skipped: skipped.length,
    errors,
  });
}
