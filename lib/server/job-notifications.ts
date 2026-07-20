import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { sendAdminOverdueOfferPush } from "@/lib/server/admin-job-status-notifications";
import { sendStaffPushNotifications } from "@/lib/server/staff-push-notifications";
import { createJobEmailActionUrl } from "@/lib/server/job-email-actions";
import { processExpiredCleanerTrainingOffers } from "@/lib/server/cleaner-training-rotation";

export type JobNotificationKind = "cleaner" | "grounds";
type JobNotificationMode = "offer" | "offer_reminder" | "day_of";

type Recipient = {
  profileId: string | null;
  email: string;
  name: string | null;
};

type SlotBundle = {
  slotId: string;
  jobId: string;
  organizationId: string;
  organizationName: string | null;
  kind: JobNotificationKind;
  status: string | null;
  offeredAt: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  offerEmailSentAt: string | null;
  offerReminderSentAt: string | null;
  dayOfReminderSentAt: string | null;
  offerPushSentAt: string | null;
  offerReminderPushSentAt: string | null;
  dayOfReminderPushSentAt: string | null;
  propertyName: string;
  propertyAddress: string | null;
  jobDate: string | null;
  detailLabel: string;
  accountLabel: string;
  recipients: Recipient[];
  sameDayTurnover: boolean;
  sameDayCheckInLabel: string | null;
};

type JobCancellationBundle = {
  organizationId: string;
  organizationName: string | null;
  kind: JobNotificationKind;
  jobId: string;
  propertyName: string;
  propertyAddress: string | null;
  jobDate: string | null;
  detailLabel: string;
  accountLabels: string[];
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

function isOptionalBookingEventsError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("property_booking_events") ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}

async function loadSameDayTurnoverInfo(
  service: ReturnType<typeof getServiceClient>,
  propertyId: string,
  jobDate: string | null
) {
  if (!jobDate) return { sameDayTurnover: false, sameDayCheckInLabel: null };

  const { data, error } = await service
    .from("property_booking_events")
    .select("source, summary, guest_count, checkin_date")
    .eq("property_id", propertyId)
    .eq("checkin_date", jobDate)
    .limit(1);

  if (error) {
    if (isOptionalBookingEventsError(error)) {
      return { sameDayTurnover: false, sameDayCheckInLabel: null };
    }
    throw new Error(error.message);
  }

  const booking = data?.[0] || null;
  if (!booking) return { sameDayTurnover: false, sameDayCheckInLabel: null };

  const source = String(booking.source || "").trim();
  const summary = String(booking.summary || "").trim();
  const guestCount = typeof booking.guest_count === "number" ? booking.guest_count : null;
  const parts = [source, summary, guestCount ? `${guestCount} guest${guestCount === 1 ? "" : "s"}` : ""].filter(Boolean);

  return {
    sameDayTurnover: true,
    sameDayCheckInLabel: parts.length > 0 ? parts.join(" - ") : "Incoming guest checks in the same day",
  };
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

function getPortalUrl(kind: JobNotificationKind, origin: string, slotId?: string | null) {
  const url = new URL("/login", origin);
  url.searchParams.set("portal", kind);
  if (slotId) url.searchParams.set("slotId", slotId);
  return url.toString();
}

function getUniqueRecipients(recipients: Recipient[]) {
  const unique = new Map<string, Recipient>();

  for (const recipient of recipients) {
    const key = recipient.email.trim().toLowerCase();
    if (!key || unique.has(key)) continue;
    unique.set(key, recipient);
  }

  return [...unique.values()];
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

function getPushSentColumn(mode: JobNotificationMode) {
  switch (mode) {
    case "offer":
      return "offer_push_sent_at";
    case "offer_reminder":
      return "offer_reminder_push_sent_at";
    case "day_of":
      return "day_of_reminder_push_sent_at";
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
        profileId: profile.id,
        email,
        name: profile.full_name || null,
      });
    }
  }

  const normalizedAccountEmail = String(accountEmail || "").trim().toLowerCase();
  if (normalizedAccountEmail && !recipients.has(normalizedAccountEmail)) {
    recipients.set(normalizedAccountEmail, {
      profileId: null,
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
      ? `id, job_id, ${accountIdColumn}, status, offered_at, accepted_at, expires_at, offer_email_sent_at, offer_reminder_sent_at, day_of_reminder_sent_at, offer_push_sent_at, offer_reminder_push_sent_at, day_of_reminder_push_sent_at`
      : `id, job_id, ${accountIdColumn}, status, offered_at, accepted_at, expires_at, offer_email_sent_at, offer_reminder_sent_at, day_of_reminder_sent_at, offer_push_sent_at, offer_reminder_push_sent_at, day_of_reminder_push_sent_at`;

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

  async function loadOrganizationName(organizationId: string | null | undefined) {
    if (!organizationId) return null;

    const { data: organization, error: organizationError } = await service
      .from("organizations")
      .select("id,name")
      .eq("id", organizationId)
      .maybeSingle();

    if (organizationError) throw new Error(organizationError.message);
    return organization?.name || null;
  }

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
      .select("id,organization_id,name,address")
      .eq("id", job.property_id)
      .maybeSingle();

    if (propertyError) throw new Error(propertyError.message);
    if (!property) return null;
    const jobDate = getCleanerJobDate(job);
    const sameDayTurnoverInfo = await loadSameDayTurnoverInfo(service, job.property_id, jobDate);
    const organizationName = await loadOrganizationName(property.organization_id || null);

    return {
      slotId: slot.id,
      jobId: job.id,
      organizationId: property.organization_id || "",
      organizationName,
      kind,
      status: slot.status || null,
      offeredAt: slot.offered_at || null,
      acceptedAt: slot.accepted_at || null,
      expiresAt: slot.expires_at || null,
      offerEmailSentAt: slot.offer_email_sent_at || null,
      offerReminderSentAt: slot.offer_reminder_sent_at || null,
      dayOfReminderSentAt: slot.day_of_reminder_sent_at || null,
      offerPushSentAt: slot.offer_push_sent_at || null,
      offerReminderPushSentAt: slot.offer_reminder_push_sent_at || null,
      dayOfReminderPushSentAt: slot.day_of_reminder_push_sent_at || null,
      propertyName: property.name || property.address || "Property",
      propertyAddress: property.address || null,
      jobDate,
      detailLabel: "Cleaning job",
      accountLabel,
      recipients,
      ...sameDayTurnoverInfo,
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
    .select("id,organization_id,name,address")
    .eq("id", job.property_id)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);
  if (!property) return null;
  const organizationName = await loadOrganizationName(property.organization_id || null);

  return {
    slotId: slot.id,
    jobId: job.id,
    organizationId: property.organization_id || "",
    organizationName,
    kind,
    status: slot.status || null,
    offeredAt: slot.offered_at || null,
    acceptedAt: slot.accepted_at || null,
    expiresAt: slot.expires_at || null,
    offerEmailSentAt: slot.offer_email_sent_at || null,
    offerReminderSentAt: slot.offer_reminder_sent_at || null,
    dayOfReminderSentAt: slot.day_of_reminder_sent_at || null,
    offerPushSentAt: slot.offer_push_sent_at || null,
    offerReminderPushSentAt: slot.offer_reminder_push_sent_at || null,
    dayOfReminderPushSentAt: slot.day_of_reminder_push_sent_at || null,
    propertyName: property.name || property.address || "Property",
    propertyAddress: property.address || null,
    jobDate: job.scheduled_for || null,
    detailLabel: getGroundsJobTypeLabel(job.job_type),
    accountLabel,
    recipients,
    sameDayTurnover: false,
    sameDayCheckInLabel: null,
  };
}

function buildDigestJobRow(bundle: SlotBundle, recipient: Recipient, origin: string) {
  const acceptUrl = createJobEmailActionUrl(origin, bundle.kind, "accept", bundle.slotId, recipient.email, {
    offerVersion: bundle.offeredAt,
  });
  const declineUrl = createJobEmailActionUrl(origin, bundle.kind, "decline", bundle.slotId, recipient.email, {
    offerVersion: bundle.offeredAt,
  });
  const propertyLine = bundle.propertyAddress
    ? `${bundle.propertyName} - ${bundle.propertyAddress}`
    : bundle.propertyName;
  const sameDayWarning = bundle.sameDayTurnover
    ? `
      <div style="border:1px solid #f1b36d;background:#fff4e4;color:#7a3f05;border-radius:12px;padding:10px 12px;margin:10px 0 12px;font-weight:700;">
        Same-day turnover: an incoming guest checks in on this checkout date${bundle.sameDayCheckInLabel ? ` (${bundle.sameDayCheckInLabel})` : ""}. Please prioritize timing.
      </div>
    `
    : "";

  return `
    <div style="border:1px solid #eadfce;border-radius:14px;padding:14px;margin:0 0 12px;background:#fffaf4;">
      ${bundle.organizationName ? `<p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:#8a7047;">${bundle.organizationName}</p>` : ""}
      <p style="margin:0 0 6px;font-weight:700;color:#241c15;">${propertyLine}</p>
      <p style="margin:0 0 6px;color:#5f5245;"><strong>Scheduled:</strong> ${formatDateLabel(bundle.jobDate)}</p>
      <p style="margin:0 0 12px;color:#5f5245;"><strong>Team / account:</strong> ${bundle.accountLabel}</p>
      ${sameDayWarning}
      <a href="${acceptUrl}" style="display:inline-block;padding:10px 14px;background:#1f6f3d;color:#ffffff;border-radius:999px;text-decoration:none;margin:0 8px 8px 0;font-weight:700;">
        Accept
      </a>
      <a href="${declineUrl}" style="display:inline-block;padding:10px 14px;background:#8a2e22;color:#ffffff;border-radius:999px;text-decoration:none;margin:0 8px 8px 0;font-weight:700;">
        Decline
      </a>
    </div>
  `;
}

export async function sendJobOfferDigestEmailForSlots(
  kind: JobNotificationKind,
  slotIds: string[],
  origin: string,
  options?: {
    allowedOrganizationIds?: Set<string> | null;
    subjectPrefix?: string;
  }
) {
  const service = getServiceClient();
  const uniqueSlotIds = [...new Set(slotIds.filter(Boolean))];
  const recipientBundles = new Map<string, { recipient: Recipient; bundles: SlotBundle[] }>();
  const bundleBySlotId = new Map<string, SlotBundle>();
  let skipped = 0;
  let pushSent = 0;
  const errors: string[] = [];

  for (const slotId of uniqueSlotIds) {
    try {
      const bundle = await loadSlotBundle(service, kind, slotId);

      if (!bundle) {
        skipped += 1;
        continue;
      }

      if (
        options?.allowedOrganizationIds &&
        !options.allowedOrganizationIds.has(bundle.organizationId)
      ) {
        errors.push(`Slot ${slotId} is outside the allowed organization scope.`);
        continue;
      }

      if ((bundle.status || "").toLowerCase().trim() !== "offered") {
        skipped += 1;
        continue;
      }

      const needsEmail = !bundle.offerEmailSentAt;
      const needsPush = !bundle.offerPushSentAt;

      if (!needsEmail && !needsPush) {
        skipped += 1;
        continue;
      }

      bundleBySlotId.set(slotId, bundle);

      if (needsEmail) {
        for (const recipient of bundle.recipients) {
          const key = recipient.email.trim().toLowerCase();
          if (!key) continue;
          const row = recipientBundles.get(key) || { recipient, bundles: [] };
          row.bundles.push(bundle);
          recipientBundles.set(key, row);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown digest notification error.");
    }
  }

  let sent = 0;
  const slotsWithSuccessfulEmail = new Set<string>();
  const kindLabel = kind === "cleaner" ? "cleaning" : "grounds";

  if (recipientBundles.size > 0) {
    try {
      const resend = getResendClient();

      for (const { recipient, bundles } of recipientBundles.values()) {
        const greeting = recipient.name ? `Hi ${recipient.name},` : "Hello,";
        const count = bundles.length;
        const rows = bundles.map((bundle) => buildDigestJobRow(bundle, recipient, origin)).join("");

        const result = await resend.emails.send({
          from: process.env.INVITE_FROM_EMAIL!,
          to: recipient.email,
          subject: `${options?.subjectPrefix || "New"} ${kindLabel} job offers (${count})`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #241c15;">
              <p style="margin: 0 0 12px;">${greeting}</p>
              <h2 style="margin: 0 0 12px;">You have ${count} ${kindLabel} job offer${count === 1 ? "" : "s"} waiting for your response.</h2>
              <p style="margin: 0 0 16px; color:#5f5245;">You can accept or decline each job below. These buttons work without installing the app or logging in.</p>
              ${rows}
              <a href="${getPortalUrl(kind, origin)}" style="display:inline-block;padding:10px 16px;background:#241c15;color:#ffffff;border-radius:999px;text-decoration:none;margin-top:8px;">
                Open portal for full details
              </a>
            </div>
          `,
        });

        if (result.error) {
          errors.push(`${recipient.email}: ${result.error.message || "Digest email send failed"}`);
          continue;
        }

        sent += 1;
        for (const bundle of bundles) {
          slotsWithSuccessfulEmail.add(bundle.slotId);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown digest email notification error.");
    }
  }

  for (const slotId of slotsWithSuccessfulEmail) {
    await markNotificationSent(service, kind, slotId, "offer", "email");
  }

  for (const bundle of bundleBySlotId.values()) {
    if (bundle.offerPushSentAt) continue;

    try {
      const result = await sendNotificationPush(bundle, "offer", origin);
      if (result.failures.length > 0) {
        errors.push(...result.failures);
      }
      if (result.successCount > 0) {
        await markNotificationSent(service, kind, bundle.slotId, "offer", "push");
        pushSent += result.successCount;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown digest push notification error.");
    }
  }

  return {
    sent,
    pushSent,
    skipped,
    digestsSent: sent,
    slotsMarkedSent: slotsWithSuccessfulEmail.size,
    errors,
    considered: bundleBySlotId.size,
  };
}

async function loadJobCancellationBundle(
  service: ReturnType<typeof getServiceClient>,
  kind: JobNotificationKind,
  jobId: string
): Promise<JobCancellationBundle | null> {
  const slotTable = getSlotTable(kind);
  const accountTable = getAccountTable(kind);
  const accountIdColumn = getAccountIdColumn(kind);

  const { data: slots, error: slotError } = await (service
    .from(slotTable as any)
    .select(`id, job_id, ${accountIdColumn}, status`)
    .eq("job_id", jobId)
    .in("status", ["offered", "accepted"])) as any;

  if (slotError) throw new Error(slotError.message);

  const accountIds = [
    ...new Set((slots ?? []).map((slot: any) => slot[accountIdColumn]).filter(Boolean)),
  ];

  if (accountIds.length === 0) return null;

  const { data: accounts, error: accountError } = await (service
    .from(accountTable as any)
    .select("id,display_name,email")
    .in("id", accountIds)) as any;

  if (accountError) throw new Error(accountError.message);

  const recipients: Recipient[] = [];
  const accountLabels: string[] = [];

  for (const account of accounts ?? []) {
    const accountLabel =
      String(account.display_name || "").trim() ||
      String(account.email || "").trim() ||
      (kind === "cleaner" ? "Cleaner team" : "Grounds team");
    accountLabels.push(accountLabel);
    recipients.push(...(await loadRecipients(service, kind, account.id, account.email || null, accountLabel)));
  }

  if (kind === "cleaner") {
    const { data: job, error: jobError } = await service
      .from("turnover_jobs")
      .select("id,property_id,scheduled_for,notes")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) throw new Error(jobError.message);
    if (!job) return null;

    const { data: property, error: propertyError } = await service
      .from("properties")
      .select("id,organization_id,name,address")
      .eq("id", job.property_id)
      .maybeSingle();

    if (propertyError) throw new Error(propertyError.message);
    if (!property) return null;

    let organizationName: string | null = null;
    if (property.organization_id) {
      const { data: organization, error: organizationError } = await service
        .from("organizations")
        .select("id,name")
        .eq("id", property.organization_id)
        .maybeSingle();

      if (organizationError) throw new Error(organizationError.message);
      organizationName = organization?.name || null;
    }

    return {
      organizationId: property.organization_id || "",
      organizationName,
      kind,
      jobId,
      propertyName: property.name || property.address || "Property",
      propertyAddress: property.address || null,
      jobDate: getCleanerJobDate(job),
      detailLabel: "Cleaning job",
      accountLabels,
      recipients: getUniqueRecipients(recipients),
    };
  }

  const { data: job, error: jobError } = await service
    .from("grounds_jobs")
    .select("id,property_id,scheduled_for,job_type")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) return null;

  const { data: property, error: propertyError } = await service
    .from("properties")
    .select("id,organization_id,name,address")
    .eq("id", job.property_id)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);
  if (!property) return null;

  let organizationName: string | null = null;
  if (property.organization_id) {
    const { data: organization, error: organizationError } = await service
      .from("organizations")
      .select("id,name")
      .eq("id", property.organization_id)
      .maybeSingle();

    if (organizationError) throw new Error(organizationError.message);
    organizationName = organization?.name || null;
  }

  return {
    organizationId: property.organization_id || "",
    organizationName,
    kind,
    jobId,
    propertyName: property.name || property.address || "Property",
    propertyAddress: property.address || null,
    jobDate: job.scheduled_for || null,
    detailLabel: getGroundsJobTypeLabel(job.job_type),
    accountLabels,
    recipients: getUniqueRecipients(recipients),
  };
}

function buildEmailCopy(bundle: SlotBundle, mode: JobNotificationMode, origin: string) {
  const portalUrl = getPortalUrl(bundle.kind, origin, bundle.slotId);
  const calendarUrl =
    bundle.kind === "cleaner"
      ? `${origin}/api/cleaner-calendar-event?jobId=${encodeURIComponent(bundle.jobId)}`
      : null;
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
      actionText: "Open portal for full details",
      footer: `Please respond by ${deadlineLabel} if possible.`,
      portalUrl,
      calendarUrl,
      propertyLine,
      dateLabel,
    };
  }

  if (mode === "offer_reminder") {
    return {
      subject: `Reminder: ${kindLabel} job still waiting for response`,
      intro: `This ${bundle.detailLabel.toLowerCase()} has not been accepted yet.`,
      actionText: "Open portal for full details",
      footer: `Current response deadline: ${deadlineLabel}.`,
      portalUrl,
      calendarUrl,
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
    calendarUrl,
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
    const acceptUrl = createJobEmailActionUrl(origin, bundle.kind, "accept", bundle.slotId, recipient.email, {
      offerVersion: bundle.offeredAt,
    });
    const declineUrl = createJobEmailActionUrl(origin, bundle.kind, "decline", bundle.slotId, recipient.email, {
      offerVersion: bundle.offeredAt,
    });
    const showResponseButtons = mode === "offer" || mode === "offer_reminder";
    const sameDayWarning = bundle.sameDayTurnover
      ? `
        <div style="border:1px solid #f1b36d;background:#fff4e4;color:#7a3f05;border-radius:12px;padding:12px 14px;margin:14px 0;font-weight:700;">
          Same-day turnover: an incoming guest checks in on this checkout date${bundle.sameDayCheckInLabel ? ` (${bundle.sameDayCheckInLabel})` : ""}. Please prioritize timing.
        </div>
      `
      : "";

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #241c15;">
        <p style="margin: 0 0 12px;">${greeting}</p>
        <h2 style="margin: 0 0 12px;">${emailCopy.intro}</h2>
        <p style="margin: 0 0 8px;"><strong>Property:</strong> ${emailCopy.propertyLine}</p>
        ${bundle.organizationName ? `<p style="margin: 0 0 8px;"><strong>Organization:</strong> ${bundle.organizationName}</p>` : ""}
        <p style="margin: 0 0 8px;"><strong>Scheduled:</strong> ${emailCopy.dateLabel}</p>
        <p style="margin: 0 0 16px;"><strong>Team / account:</strong> ${bundle.accountLabel}</p>
        ${sameDayWarning}
        ${
          showResponseButtons
            ? `
              <div style="margin: 18px 0 10px;">
                <a href="${acceptUrl}" style="display:inline-block;padding:12px 18px;background:#1f6f3d;color:#ffffff;border-radius:999px;text-decoration:none;margin:0 8px 8px 0;font-weight:700;">
                  Accept job
                </a>
                <a href="${declineUrl}" style="display:inline-block;padding:12px 18px;background:#8a2e22;color:#ffffff;border-radius:999px;text-decoration:none;margin:0 8px 8px 0;font-weight:700;">
                  Decline
                </a>
              </div>
              <p style="margin: 0 0 14px; font-size:13px; color:#6f6255;">These buttons work without installing the app or logging in.</p>
            `
            : ""
        }
        <div style="margin-top:8px;">
          <a href="${emailCopy.portalUrl}" style="display:inline-block;padding:10px 16px;background:#241c15;color:#ffffff;border-radius:999px;text-decoration:none;margin:0 8px 8px 0;">
            ${emailCopy.actionText}
          </a>
          ${
            emailCopy.calendarUrl && mode === "day_of"
              ? `
                <a href="${emailCopy.calendarUrl}" style="display:inline-block;padding:10px 16px;background:#b08b47;color:#120f0b;border-radius:999px;text-decoration:none;margin:0 8px 8px 0;font-weight:700;">
                  Add to Calendar
                </a>
              `
              : ""
          }
        </div>
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

async function sendNotificationPush(
  bundle: SlotBundle,
  mode: JobNotificationMode,
  origin: string
) {
  const emailCopy = buildEmailCopy(bundle, mode, origin);
  const profileIds = bundle.recipients
    .map((recipient) => recipient.profileId)
    .filter((profileId): profileId is string => Boolean(profileId));

  if (profileIds.length === 0) {
    return {
      successCount: 0,
      failures: [`${bundle.accountLabel}: no linked ${bundle.kind} login profile for push notifications.`],
    };
  }

  const result = await sendStaffPushNotifications(bundle.kind, profileIds, {
    title: emailCopy.subject,
    body: bundle.sameDayTurnover
      ? `Same-day turnover - ${bundle.organizationName ? `${bundle.organizationName}: ` : ""}${bundle.propertyName} - ${emailCopy.dateLabel}`
      : `${bundle.organizationName ? `${bundle.organizationName}: ` : ""}${bundle.propertyName} - ${emailCopy.dateLabel}`,
    url: emailCopy.portalUrl,
    tag: `${bundle.kind}-${mode}-${bundle.slotId}`,
  });

  return {
    successCount: result.sent,
    failures:
      result.sent === 0 && result.errors.length === 0
        ? [`${bundle.accountLabel}: no active ${bundle.kind} push device is registered.`]
        : result.errors,
  };
}

async function sendCancellationEmail(bundle: JobCancellationBundle, origin: string) {
  const resend = getResendClient();
  const portalUrl = getPortalUrl(bundle.kind, origin);
  const dateLabel = formatDateLabel(bundle.jobDate);
  const kindLabel = bundle.kind === "cleaner" ? "cleaning" : "grounds";
  const propertyLine = bundle.propertyAddress
    ? `${bundle.propertyName} - ${bundle.propertyAddress}`
    : bundle.propertyName;
  const accountLine = bundle.accountLabels.length > 0 ? bundle.accountLabels.join(", ") : "Assigned team";

  let successCount = 0;
  const failures: string[] = [];

  for (const recipient of bundle.recipients) {
    const greeting = recipient.name ? `Hi ${recipient.name},` : "Hello,";
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #241c15;">
        <p style="margin: 0 0 12px;">${greeting}</p>
        <h2 style="margin: 0 0 12px;">This ${bundle.detailLabel.toLowerCase()} was removed from the schedule.</h2>
        <p style="margin: 0 0 8px;"><strong>Property:</strong> ${propertyLine}</p>
        ${bundle.organizationName ? `<p style="margin: 0 0 8px;"><strong>Organization:</strong> ${bundle.organizationName}</p>` : ""}
        <p style="margin: 0 0 8px;"><strong>Original scheduled date:</strong> ${dateLabel}</p>
        <p style="margin: 0 0 16px;"><strong>Team / account:</strong> ${accountLine}</p>
        <p style="margin: 0 0 16px;">This usually happens when a booking is cancelled, moved, or replaced by a new reservation.</p>
        <a href="${portalUrl}" style="display:inline-block;padding:10px 16px;background:#241c15;color:#ffffff;border-radius:999px;text-decoration:none;margin-top:8px;">
          Open portal
        </a>
        <p style="margin-top:20px; font-size:14px; color:#5f5245;">Please check the portal for your current ${kindLabel} schedule.</p>
      </div>
    `;

    const result = await resend.emails.send({
      from: process.env.INVITE_FROM_EMAIL!,
      to: recipient.email,
      subject: `${bundle.detailLabel} removed: ${bundle.propertyName} on ${dateLabel}`,
      html,
    });

    if (result.error) {
      failures.push(`${recipient.email}: ${result.error.message || "Email send failed"}`);
      continue;
    }

    successCount += 1;
  }

  return { successCount, failures };
}

async function sendCancellationPush(bundle: JobCancellationBundle, origin: string) {
  const portalUrl = getPortalUrl(bundle.kind, origin);
  const dateLabel = formatDateLabel(bundle.jobDate);
  const profileIds = bundle.recipients
    .map((recipient) => recipient.profileId)
    .filter((profileId): profileId is string => Boolean(profileId));

  if (profileIds.length === 0) {
    return { successCount: 0, failures: [] as string[] };
  }

  const result = await sendStaffPushNotifications(bundle.kind, profileIds, {
    title: `${bundle.detailLabel} removed`,
    body: `${bundle.organizationName ? `${bundle.organizationName}: ` : ""}${bundle.propertyName} - ${dateLabel}`,
    url: portalUrl,
    tag: `${bundle.kind}-canceled-${bundle.jobId}`,
  });

  return {
    successCount: result.sent,
    failures: result.errors,
  };
}

async function markNotificationSent(
  service: ReturnType<typeof getServiceClient>,
  kind: JobNotificationKind,
  slotId: string,
  mode: JobNotificationMode,
  channel: "email" | "push" = "email"
) {
  const slotTable = getSlotTable(kind);
  const sentColumn = channel === "email" ? getSentColumn(mode) : getPushSentColumn(mode);

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

async function sendSlotNotificationChannels(
  service: ReturnType<typeof getServiceClient>,
  kind: JobNotificationKind,
  slotId: string,
  bundle: SlotBundle,
  mode: JobNotificationMode,
  origin: string,
  options?: {
    sendEmail?: boolean;
    sendPush?: boolean;
  }
) {
  let sent = 0;
  let pushSent = 0;
  const errors: string[] = [];

  if (options?.sendEmail !== false) {
    try {
      const result = await sendNotificationEmail(bundle, mode, origin);
      if (result.failures.length > 0) {
        errors.push(...result.failures);
      }
      if (result.successCount > 0) {
        await markNotificationSent(service, kind, slotId, mode, "email");
        sent += result.successCount;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown email notification error.");
    }
  }

  if (options?.sendPush !== false) {
    try {
      const result = await sendNotificationPush(bundle, mode, origin);
      if (result.failures.length > 0) {
        errors.push(...result.failures);
      }
      if (result.successCount > 0) {
        await markNotificationSent(service, kind, slotId, mode, "push");
        pushSent += result.successCount;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown push notification error.");
    }
  }

  return {
    sent,
    pushSent,
    errors,
  };
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
  return !!bundle.jobDate && bundle.jobDate === getTodayYmd(now);
}

export async function sendJobOfferEmailsForSlots(
  kind: JobNotificationKind,
  slotIds: string[],
  origin: string,
  options?: {
    allowedOrganizationIds?: Set<string> | null;
    forceResend?: boolean;
  }
) {
  const service = getServiceClient();
  const uniqueSlotIds = [...new Set(slotIds.filter(Boolean))];

  let sent = 0;
  let pushSent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const slotId of uniqueSlotIds) {
    try {
      const bundle = await loadSlotBundle(service, kind, slotId);

      if (!bundle) {
        skipped += 1;
        continue;
      }

      if (
        options?.allowedOrganizationIds &&
        !options.allowedOrganizationIds.has(bundle.organizationId)
      ) {
        errors.push(`Slot ${slotId} is outside the allowed organization scope.`);
        continue;
      }

      if ((bundle.status || "").toLowerCase().trim() !== "offered") {
        skipped += 1;
        continue;
      }

      const needsEmail = options?.forceResend ? true : !bundle.offerEmailSentAt;
      const needsPush = options?.forceResend ? true : !bundle.offerPushSentAt;

      if (!needsEmail && !needsPush) {
        skipped += 1;
        continue;
      }

      const result = await sendSlotNotificationChannels(service, kind, slotId, bundle, "offer", origin, {
        sendEmail: needsEmail,
        sendPush: needsPush,
      });
      sent += result.sent;
      pushSent += result.pushSent;
      errors.push(...result.errors);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown notification error.");
    }
  }

  return {
    sent,
    pushSent,
    skipped,
    errors,
  };
}

export async function sendJobCancellationNotificationsForJobs(
  kind: JobNotificationKind,
  jobIds: string[],
  origin: string,
  options?: {
    allowedOrganizationIds?: Set<string> | null;
  }
) {
  const service = getServiceClient();
  const uniqueJobIds = [...new Set(jobIds.filter(Boolean))];

  let sent = 0;
  let pushSent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const jobId of uniqueJobIds) {
    try {
      const bundle = await loadJobCancellationBundle(service, kind, jobId);
      if (!bundle) {
        skipped += 1;
        continue;
      }

      if (
        options?.allowedOrganizationIds &&
        !options.allowedOrganizationIds.has(bundle.organizationId)
      ) {
        errors.push(`Job ${jobId} is outside the allowed organization scope.`);
        continue;
      }

      const emailResult = await sendCancellationEmail(bundle, origin);
      sent += emailResult.successCount;
      errors.push(...emailResult.failures);

      const pushResult = await sendCancellationPush(bundle, origin);
      pushSent += pushResult.successCount;
      errors.push(...pushResult.failures);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown cancellation notification error.");
    }
  }

  return {
    sent,
    pushSent,
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
  const pushSentColumn = getPushSentColumn(mode);

  let query = service
    .from(slotTable as any)
    .select(
      `id,status,offered_at,accepted_at,expires_at,offer_email_sent_at,offer_reminder_sent_at,day_of_reminder_sent_at,offer_push_sent_at,offer_reminder_push_sent_at,day_of_reminder_push_sent_at,${accountIdColumn}`
    )
    .not(accountIdColumn, "is", null);

  if (mode === "offer") {
    query = query.eq("status", "offered");
  } else if (mode === "offer_reminder") {
    query = query.eq("status", "offered").not("offered_at", "is", null);
  } else {
    query = query.eq("status", "accepted");
  }

  const { data: rows, error } = await query as any;

  if (error) {
    throw new Error(error.message);
  }

  let sent = 0;
  let pushSent = 0;
  let considered = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    if (row[sentColumn] && row[pushSentColumn]) continue;

    const bundle = await loadSlotBundle(service, kind, row.id);
    if (!bundle) continue;

    let eligible = false;
    if (mode === "offer") eligible = (bundle.status || "").toLowerCase().trim() === "offered";
    if (mode === "offer_reminder") eligible = shouldSendOfferReminder(bundle);
    if (mode === "day_of") eligible = shouldSendDayOfReminder(bundle);

    if (!eligible) continue;

    considered += 1;

    try {
      const result = await sendSlotNotificationChannels(service, kind, row.id, bundle, mode, origin, {
        sendEmail: !row[sentColumn],
        sendPush: !row[pushSentColumn],
      });
      sent += result.sent;
      pushSent += result.pushSent;
      errors.push(...result.errors);
    } catch (sweepError) {
      errors.push(sweepError instanceof Error ? sweepError.message : "Unknown notification error.");
    }
  }

  return {
    considered,
    sent,
    pushSent,
    errors,
  };
}

async function runOfferDigestEmailSweep(kind: JobNotificationKind, origin: string) {
  const service = getServiceClient();
  const slotTable = getSlotTable(kind);
  const accountIdColumn = getAccountIdColumn(kind);

  const { data: rows, error } = await (service
    .from(slotTable as any)
    .select(`id, ${accountIdColumn}`)
    .eq("status", "offered")
    .not(accountIdColumn, "is", null)
    .is("offer_email_sent_at", null)) as any;

  if (error) {
    throw new Error(error.message);
  }

  const slotIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
  if (slotIds.length === 0) {
    return { sent: 0, pushSent: 0, skipped: 0, digestsSent: 0, slotsMarkedSent: 0, errors: [] as string[], considered: 0 };
  }

  return sendJobOfferDigestEmailForSlots(kind, slotIds, origin);
}

async function notifyAdminsForOverdueOffers(kind: JobNotificationKind, origin: string) {
  const service = getServiceClient();
  const slotTable = getSlotTable(kind);
  const accountIdColumn = getAccountIdColumn(kind);
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await (service
    .from(slotTable as any)
    .select(`id, expires_at, status, ${accountIdColumn}`)
    .eq("status", "offered")
    .not(accountIdColumn, "is", null)
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso)) as any;

  if (error) {
    throw new Error(error.message);
  }

  let sent = 0;
  let considered = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    considered += 1;
    try {
      const result = await sendAdminOverdueOfferPush(service, kind, row.id, origin);
      sent += Number(result.sent || 0);
      if (result.errors?.length) {
        errors.push(...result.errors);
      }
    } catch (notifyError) {
      errors.push(notifyError instanceof Error ? notifyError.message : "Unknown overdue admin notification error.");
    }
  }

  return {
    considered,
    sent,
    errors,
  };
}

export async function sendScheduledJobNotificationEmails(origin: string) {
  const service = getServiceClient();
  const expiredTrainingOffers = await processExpiredCleanerTrainingOffers(service);
  const expiredTrainingOfferNotifications =
    expiredTrainingOffers.offeredSlotIds.length > 0
      ? await sendJobOfferDigestEmailForSlots("cleaner", expiredTrainingOffers.offeredSlotIds, origin, {
          subjectPrefix: "New",
        })
      : null;
  const cleanerOfferDigests = await runOfferDigestEmailSweep("cleaner", origin);
  const groundsOfferDigests = await runOfferDigestEmailSweep("grounds", origin);
  const cleanerOffers = await runSlotNotificationSweep("cleaner", "offer", origin);
  const groundsOffers = await runSlotNotificationSweep("grounds", "offer", origin);
  const cleanerReminders = await runSlotNotificationSweep("cleaner", "offer_reminder", origin);
  const groundsReminders = await runSlotNotificationSweep("grounds", "offer_reminder", origin);
  const cleanerDayOf = await runSlotNotificationSweep("cleaner", "day_of", origin);
  const groundsDayOf = await runSlotNotificationSweep("grounds", "day_of", origin);
  const cleanerOverdueAdminAlerts = await notifyAdminsForOverdueOffers("cleaner", origin);
  const groundsOverdueAdminAlerts = await notifyAdminsForOverdueOffers("grounds", origin);

  return {
    expiredTrainingOffers: {
      ...expiredTrainingOffers,
      notificationResult: expiredTrainingOfferNotifications,
    },
    cleanerOfferDigests,
    groundsOfferDigests,
    cleanerOffers,
    groundsOffers,
    cleanerReminders,
    groundsReminders,
    cleanerDayOf,
    groundsDayOf,
    cleanerOverdueAdminAlerts,
    groundsOverdueAdminAlerts,
  };
}
