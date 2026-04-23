import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export type JobNotificationKind = "cleaner" | "grounds";
type JobNotificationMode = "offer" | "offer_reminder" | "day_of";

type Recipient = {
  email: string;
  name: string | null;
};

type SlotBundle = {
  slotId: string;
  kind: JobNotificationKind;
  status: string | null;
  offeredAt: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  offerEmailSentAt: string | null;
  offerReminderSentAt: string | null;
  dayOfReminderSentAt: string | null;
  propertyName: string;
  propertyAddress: string | null;
  jobDate: string | null;
  detailLabel: string;
  accountLabel: string;
  recipients: Recipient[];
};

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is missing from environment variables.");
  }

  if (!process.env.INVITE_FROM_EMAIL) {
    throw new Error("INVITE_FROM_EMAIL is missing from environment variables.");
  }

  return new Resend(process.env.RESEND_API_KEY);
}

function getTodayYmd(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function getTomorrowYmd(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

function extractCheckoutDate(notes: string | null) {
  if (!notes) return null;
  const match = notes.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function getCleanerJobDate(job: { scheduled_for?: string | null; notes?: string | null }) {
  return job.scheduled_for || extractCheckoutDate(job.notes || null);
}

function getResponseWindowHours(jobDate: string | null, now = new Date()) {
  if (!jobDate) return 8;

  const job = new Date(`${jobDate}T12:00:00`);
  const diffHours = (job.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours > 24 * 7) return 48;
  if (diffHours > 48) return 8;
  return 2;
}

function formatDateLabel(dateString: string | null) {
  if (!dateString) return "an upcoming date";

  const d = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateString;

  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateTimeLabel(dateString: string | null) {
  if (!dateString) return "soon";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;

  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getGroundsJobTypeLabel(jobType: string | null | undefined) {
  switch ((jobType || "").toLowerCase()) {
    case "lawn_cut":
      return "Lawn cut";
    case "yard_cleanup":
      return "Yard cleanup";
    case "garbage_out":
      return "Garbage out";
    case "recycling_out":
      return "Recycling out";
    case "yard_waste_out":
      return "Yard waste out";
    case "bulk_pickup_out":
      return "Bulk pickup";
    case "snow_clear":
      return "Snow clearing";
    case "salt":
      return "Salt / ice";
    case "exterior_check":
      return "Exterior check";
    case "storm_cleanup":
      return "Storm cleanup";
    default:
      return "Grounds job";
  }
}

function getPortalUrl(kind: JobNotificationKind, origin: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("portal", kind);
  return url.toString();
}

function getSlotTable(kind: JobNotificationKind) {
  return kind === "cleaner" ? "turnover_job_slots" : "grounds_job_slots";
}

function getAccountTable(kind: JobNotificationKind) {
  return kind === "cleaner" ? "cleaner_accounts" : "grounds_accounts";
}

function getMembershipTable(kind: JobNotificationKind) {
  return kind === "cleaner" ? "cleaner_account_members" : "grounds_account_members";
}

function getAccountIdColumn(kind: JobNotificationKind) {
  return kind === "cleaner" ? "cleaner_account_id" : "grounds_account_id";
}

function getSentColumn(mode: JobNotificationMode) {
  switch (mode) {
    case "offer":
      return "offer_email_sent_at";
    case "offer_reminder":
      return "offer_reminder_sent_at";
    case "day_of":
      return "day_of_reminder_sent_at";
  }
}

async function loadRecipients(
  service: ReturnType<typeof getServiceClient>,
  kind: JobNotificationKind,
  accountId: string,
  accountEmail: string | null,
  accountLabel: string
) {
  const membershipTable = getMembershipTable(kind);
  const accountIdColumn = getAccountIdColumn(kind);

  const { data: membershipRows, error: membershipError } = await (service
    .from(membershipTable as any)
    .select(`profile_id, ${accountIdColumn}`)
    .eq(accountIdColumn, accountId)) as any;

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const profileIds = [...new Set((membershipRows ?? []).map((row: any) => row.profile_id).filter(Boolean))];
  const recipients = new Map<string, Recipient>();

  if (profileIds.length > 0) {
    const { data: profiles, error: profilesError } = await service
      .from("profiles")
      .select("id,email,full_name")
      .in("id", profileIds);

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    for (const profile of profiles ?? []) {
      const email = String(profile.email || "").trim().toLowerCase();
      if (!email) continue;
      recipients.set(email, {
        email,
        name: profile.full_name || null,
      });
    }
  }

  const normalizedAccountEmail = String(accountEmail || "").trim().toLowerCase();
  if (normalizedAccountEmail && !recipients.has(normalizedAccountEmail)) {
    recipients.set(normalizedAccountEmail, {
      email: normalizedAccountEmail,
      name: accountLabel || null,
    });
  }

  return [...recipients.values()];
}

async function loadSlotBundle(
  service: ReturnType<typeof getServiceClient>,
  kind: JobNotificationKind,
  slotId: string
): Promise<SlotBundle | null> {
  const slotTable = getSlotTable(kind);
  const accountTable = getAccountTable(kind);
  const accountIdColumn = getAccountIdColumn(kind);

  const slotSelect =
    kind === "cleaner"
      ? `id, job_id, ${accountIdColumn}, status, offered_at, accepted_at, expires_at, offer_email_sent_at, offer_reminder_sent_at, day_of_reminder_sent_at`
      : `id, job_id, ${accountIdColumn}, status, offered_at, accepted_at, expires_at, offer_email_sent_at, offer_reminder_sent_at, day_of_reminder_sent_at`;

  const { data: slot, error: slotError } = await (service
    .from(slotTable as any)
    .select(slotSelect)
    .eq("id", slotId)
    .maybeSingle()) as any;

  if (slotError) throw new Error(slotError.message);
  if (!slot) return null;

  const accountId = slot[accountIdColumn];
  if (!accountId) return null;

  const { data: account, error: accountError } = await (service
    .from(accountTable as any)
    .select("id,display_name,email")
    .eq("id", accountId)
    .maybeSingle()) as any;

  if (accountError) throw new Error(accountError.message);
  if (!account) return null;

  const accountLabel =
    String(account.display_name || "").trim() ||
    String(account.email || "").trim() ||
    (kind === "cleaner" ? "Cleaner team" : "Grounds team");

  const recipients = await loadRecipients(service, kind, accountId, account.email || null, accountLabel);
  if (recipients.length === 0) return null;

  if (kind === "cleaner") {
    const { data: job, error: jobError } = await service
      .from("turnover_jobs")
      .select("id,property_id,scheduled_for,notes")
      .eq("id", slot.job_id)
      .maybeSingle();

    if (jobError) throw new Error(jobError.message);
    if (!job) return null;

    const { data: property, error: propertyError } = await service
      .from("properties")
      .select("id,name,address")
      .eq("id", job.property_id)
      .maybeSingle();

    if (propertyError) throw new Error(propertyError.message);
    if (!property) return null;

    return {
      slotId: slot.id,
      kind,
      status: slot.status || null,
      offeredAt: slot.offered_at || null,
      acceptedAt: slot.accepted_at || null,
      expiresAt: slot.expires_at || null,
      offerEmailSentAt: slot.offer_email_sent_at || null,
      offerReminderSentAt: slot.offer_reminder_sent_at || null,
      dayOfReminderSentAt: slot.day_of_reminder_sent_at || null,
      propertyName: property.name || property.address || "Property",
      propertyAddress: property.address || null,
      jobDate: getCleanerJobDate(job),
      detailLabel: "Cleaning job",
      accountLabel,
      recipients,
    };
  }

  const { data: job, error: jobError } = await service
    .from("grounds_jobs")
    .select("id,property_id,scheduled_for,job_type")
    .eq("id", slot.job_id)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) return null;

  const { data: property, error: propertyError } = await service
    .from("properties")
    .select("id,name,address")
    .eq("id", job.property_id)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);
  if (!property) return null;

  return {
    slotId: slot.id,
    kind,
    status: slot.status || null,
    offeredAt: slot.offered_at || null,
    acceptedAt: slot.accepted_at || null,
    expiresAt: slot.expires_at || null,
    offerEmailSentAt: slot.offer_email_sent_at || null,
    offerReminderSentAt: slot.offer_reminder_sent_at || null,
    dayOfReminderSentAt: slot.day_of_reminder_sent_at || null,
    propertyName: property.name || property.address || "Property",
    propertyAddress: property.address || null,
    jobDate: job.scheduled_for || null,
    detailLabel: getGroundsJobTypeLabel(job.job_type),
    accountLabel,
    recipients,
  };
}

function buildEmailCopy(bundle: SlotBundle, mode: JobNotificationMode, origin: string) {
  const portalUrl = getPortalUrl(bundle.kind, origin);
  const dateLabel = formatDateLabel(bundle.jobDate);
  const deadlineLabel = formatDateTimeLabel(bundle.expiresAt);
  const kindLabel = bundle.kind === "cleaner" ? "cleaning" : "grounds";
  const propertyLine = bundle.propertyAddress
    ? `${bundle.propertyName} - ${bundle.propertyAddress}`
    : bundle.propertyName;

  if (mode === "offer") {
    return {
      subject: `New ${kindLabel} job offer: ${bundle.propertyName} on ${dateLabel}`,
      intro: `You have a new ${bundle.detailLabel.toLowerCase()} waiting for your response.`,
      actionText: "Open portal to review and accept",
      footer: `Please respond by ${deadlineLabel} if possible.`,
      portalUrl,
      propertyLine,
      dateLabel,
    };
  }

  if (mode === "offer_reminder") {
    return {
      subject: `Reminder: ${kindLabel} job still waiting for response`,
      intro: `This ${bundle.detailLabel.toLowerCase()} has not been accepted yet.`,
      actionText: "Open portal and respond",
      footer: `Current response deadline: ${deadlineLabel}.`,
      portalUrl,
      propertyLine,
      dateLabel,
    };
  }

  return {
    subject: `Today's ${kindLabel} job: ${bundle.propertyName}`,
    intro: `Reminder for today's ${bundle.detailLabel.toLowerCase()}.`,
    actionText: "Open portal for details",
    footer: `Scheduled for ${dateLabel}.`,
    portalUrl,
    propertyLine,
    dateLabel,
  };
}

async function sendNotificationEmail(
  bundle: SlotBundle,
  mode: JobNotificationMode,
  origin: string
) {
  const resend = getResendClient();
  const emailCopy = buildEmailCopy(bundle, mode, origin);

  let successCount = 0;
  const failures: string[] = [];

  for (const recipient of bundle.recipients) {
    const greeting = recipient.name ? `Hi ${recipient.name},` : "Hello,";

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #241c15;">
        <p style="margin: 0 0 12px;">${greeting}</p>
        <h2 style="margin: 0 0 12px;">${emailCopy.intro}</h2>
        <p style="margin: 0 0 8px;"><strong>Property:</strong> ${emailCopy.propertyLine}</p>
        <p style="margin: 0 0 8px;"><strong>Scheduled:</strong> ${emailCopy.dateLabel}</p>
        <p style="margin: 0 0 16px;"><strong>Team / account:</strong> ${bundle.accountLabel}</p>
        <a href="${emailCopy.portalUrl}" style="display:inline-block;padding:10px 16px;background:#241c15;color:#ffffff;border-radius:999px;text-decoration:none;margin-top:8px;">
          ${emailCopy.actionText}
        </a>
        <p style="margin-top:20px; font-size:14px; color:#5f5245;">${emailCopy.footer}</p>
      </div>
    `;

    const result = await resend.emails.send({
      from: process.env.INVITE_FROM_EMAIL!,
      to: recipient.email,
      subject: emailCopy.subject,
      html,
    });

    if (result.error) {
      failures.push(`${recipient.email}: ${result.error.message || "Email send failed"}`);
      continue;
    }

    successCount += 1;
  }

  return {
    successCount,
    failures,
  };
}

async function markNotificationSent(
  service: ReturnType<typeof getServiceClient>,
  kind: JobNotificationKind,
  slotId: string,
  mode: JobNotificationMode
) {
  const slotTable = getSlotTable(kind);
  const sentColumn = getSentColumn(mode);

  const { error } = await (service
    .from(slotTable as any)
    .update({
      [sentColumn]: new Date().toISOString(),
    })
    .eq("id", slotId)) as any;

  if (error) {
    throw new Error(error.message);
  }
}

function shouldSendOfferReminder(bundle: SlotBundle, now = new Date()) {
  if ((bundle.status || "").toLowerCase().trim() !== "offered") return false;
  if (bundle.offerReminderSentAt) return false;

  const offered = bundle.offeredAt ? new Date(bundle.offeredAt) : null;
  if (!offered || Number.isNaN(offered.getTime())) return false;

  const jobDate = bundle.jobDate;
  const responseHours = getResponseWindowHours(jobDate, now);
  const reminderHours = Math.max(1, responseHours / 2);
  const reminderAt = new Date(offered.getTime() + reminderHours * 60 * 60 * 1000);

  if (now >= reminderAt) return true;

  const tomorrowYmd = getTomorrowYmd(now);
  return !!jobDate && jobDate <= tomorrowYmd;
}

function shouldSendDayOfReminder(bundle: SlotBundle, now = new Date()) {
  if ((bundle.status || "").toLowerCase().trim() !== "accepted") return false;
  if (bundle.dayOfReminderSentAt) return false;
  return !!bundle.jobDate && bundle.jobDate === getTodayYmd(now);
}

export async function sendJobOfferEmailsForSlots(
  kind: JobNotificationKind,
  slotIds: string[],
  origin: string
) {
  const service = getServiceClient();
  const uniqueSlotIds = [...new Set(slotIds.filter(Boolean))];

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const slotId of uniqueSlotIds) {
    try {
      const bundle = await loadSlotBundle(service, kind, slotId);

      if (!bundle) {
        skipped += 1;
        continue;
      }

      if ((bundle.status || "").toLowerCase().trim() !== "offered") {
        skipped += 1;
        continue;
      }

      if (bundle.offerEmailSentAt) {
        skipped += 1;
        continue;
      }

      const result = await sendNotificationEmail(bundle, "offer", origin);
      if (result.successCount <= 0) {
        errors.push(...result.failures);
        continue;
      }

      await markNotificationSent(service, kind, slotId, "offer");
      sent += result.successCount;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown notification error.");
    }
  }

  return {
    sent,
    skipped,
    errors,
  };
}

async function runSlotNotificationSweep(
  kind: JobNotificationKind,
  mode: JobNotificationMode,
  origin: string
) {
  const service = getServiceClient();
  const slotTable = getSlotTable(kind);
  const accountIdColumn = getAccountIdColumn(kind);
  const sentColumn = getSentColumn(mode);

  const { data: rows, error } = await (service
    .from(slotTable as any)
    .select(
      `id,status,offered_at,accepted_at,expires_at,offer_email_sent_at,offer_reminder_sent_at,day_of_reminder_sent_at,${accountIdColumn}`
    )
    .not(accountIdColumn, "is", null)) as any;

  if (error) {
    throw new Error(error.message);
  }

  let sent = 0;
  let considered = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    if (mode === "offer" && row.offer_email_sent_at) continue;
    if (mode !== "offer" && row[sentColumn]) continue;

    const bundle = await loadSlotBundle(service, kind, row.id);
    if (!bundle) continue;

    let eligible = false;
    if (mode === "offer") eligible = (bundle.status || "").toLowerCase().trim() === "offered";
    if (mode === "offer_reminder") eligible = shouldSendOfferReminder(bundle);
    if (mode === "day_of") eligible = shouldSendDayOfReminder(bundle);

    if (!eligible) continue;

    considered += 1;

    try {
      const result = await sendNotificationEmail(bundle, mode, origin);
      if (result.successCount <= 0) {
        errors.push(...result.failures);
        continue;
      }

      await markNotificationSent(service, kind, row.id, mode);
      sent += result.successCount;
    } catch (sweepError) {
      errors.push(sweepError instanceof Error ? sweepError.message : "Unknown notification error.");
    }
  }

  return {
    considered,
    sent,
    errors,
  };
}

export async function sendScheduledJobNotificationEmails(origin: string) {
  const cleanerOffers = await runSlotNotificationSweep("cleaner", "offer", origin);
  const groundsOffers = await runSlotNotificationSweep("grounds", "offer", origin);
  const cleanerReminders = await runSlotNotificationSweep("cleaner", "offer_reminder", origin);
  const groundsReminders = await runSlotNotificationSweep("grounds", "offer_reminder", origin);
  const cleanerDayOf = await runSlotNotificationSweep("cleaner", "day_of", origin);
  const groundsDayOf = await runSlotNotificationSweep("grounds", "day_of", origin);

  return {
    cleanerOffers,
    groundsOffers,
    cleanerReminders,
    groundsReminders,
    cleanerDayOf,
    groundsDayOf,
  };
}
