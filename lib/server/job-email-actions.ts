import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { JobNotificationKind } from "@/lib/server/job-notifications";

export type JobEmailAction = "accept" | "decline" | "calendar";

type ServiceClient = any;

type SlotDetails = {
  slotId: string;
  jobId: string;
  kind: JobNotificationKind;
  status: string | null;
  jobDate: string | null;
  jobNotes: string | null;
  jobType: string | null;
  propertyName: string;
  propertyAddress: string | null;
  accountLabel: string;
};

function getSigningSecret() {
  const secret =
    process.env.JOB_EMAIL_ACTION_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Missing JOB_EMAIL_ACTION_SECRET, CRON_SECRET, or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return secret;
}

function signParts(parts: string[]) {
  return crypto.createHmac("sha256", getSigningSecret()).update(parts.join("|")).digest("hex");
}

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createJobEmailActionUrl(
  origin: string,
  kind: JobNotificationKind,
  action: JobEmailAction,
  slotId: string,
  recipientEmail: string,
  expiresAtMs = Date.now() + 30 * 24 * 60 * 60 * 1000
) {
  const email = recipientEmail.trim().toLowerCase();
  const expires = String(expiresAtMs);
  const sig = signParts([kind, action, slotId, email, expires]);
  const pathname = action === "calendar" ? "/api/job-email-calendar" : "/api/job-email-action";
  const url = new URL(pathname, origin);
  url.searchParams.set("kind", kind);
  url.searchParams.set("action", action);
  url.searchParams.set("slot", slotId);
  url.searchParams.set("email", email);
  url.searchParams.set("expires", expires);
  url.searchParams.set("sig", sig);
  return url.toString();
}

export function verifyJobEmailActionUrl(searchParams: URLSearchParams) {
  const kind: JobNotificationKind | null =
    searchParams.get("kind") === "grounds" ? "grounds" : searchParams.get("kind") === "cleaner" ? "cleaner" : null;
  const action =
    searchParams.get("action") === "accept"
      ? "accept"
      : searchParams.get("action") === "decline"
        ? "decline"
        : searchParams.get("action") === "calendar"
          ? "calendar"
          : null;
  const slotId = String(searchParams.get("slot") || "").trim();
  const email = String(searchParams.get("email") || "").trim().toLowerCase();
  const expires = String(searchParams.get("expires") || "").trim();
  const sig = String(searchParams.get("sig") || "").trim();

  if (!kind || !action || !slotId || !email || !expires || !sig) {
    return { ok: false as const, error: "This email link is missing required details." };
  }

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return { ok: false as const, error: "This email link has expired. Please ask for a fresh job email." };
  }

  const expected = signParts([kind, action, slotId, email, expires]);
  if (!timingSafeEqual(sig, expected)) {
    return { ok: false as const, error: "This email link is not valid." };
  }

  return { ok: true as const, kind, action, slotId, email };
}

export function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function extractCheckoutDate(notes: string | null) {
  if (!notes) return null;
  const match = notes.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function getCleanerJobDate(job: { scheduled_for?: string | null; notes?: string | null }) {
  return job.scheduled_for || extractCheckoutDate(job.notes || null);
}

function getSlotTable(kind: JobNotificationKind) {
  return kind === "cleaner" ? "turnover_job_slots" : "grounds_job_slots";
}

function getAccountTable(kind: JobNotificationKind) {
  return kind === "cleaner" ? "cleaner_accounts" : "grounds_accounts";
}

function getAccountIdColumn(kind: JobNotificationKind) {
  return kind === "cleaner" ? "cleaner_account_id" : "grounds_account_id";
}

function getJobTable(kind: JobNotificationKind) {
  return kind === "cleaner" ? "turnover_jobs" : "grounds_jobs";
}

function getUnitsColumn(kind: JobNotificationKind) {
  return kind === "cleaner" ? "cleaner_units_needed" : "grounds_units_needed";
}

function getActiveStatuses(kind: JobNotificationKind) {
  return kind === "cleaner" ? ["accepted", "in_progress", "completed"] : ["accepted"];
}

export async function loadJobEmailSlotDetails(
  service: ServiceClient,
  kind: JobNotificationKind,
  slotId: string
): Promise<SlotDetails | null> {
  const slotTable = getSlotTable(kind);
  const accountTable = getAccountTable(kind);
  const accountIdColumn = getAccountIdColumn(kind);
  const jobTable = getJobTable(kind);

  const { data: slot, error: slotError } = await (service
    .from(slotTable as any)
    .select(`id, job_id, ${accountIdColumn}, status`)
    .eq("id", slotId)
    .maybeSingle()) as any;

  if (slotError) throw new Error(slotError.message);
  if (!slot?.[accountIdColumn]) return null;

  const { data: account, error: accountError } = await (service
    .from(accountTable as any)
    .select("id,display_name,email")
    .eq("id", slot[accountIdColumn])
    .maybeSingle()) as any;

  if (accountError) throw new Error(accountError.message);

  const jobSelect = kind === "cleaner"
    ? "id,property_id,scheduled_for,notes"
    : "id,property_id,scheduled_for,notes,job_type";

  const { data: job, error: jobError } = await (service
    .from(jobTable as any)
    .select(jobSelect)
    .eq("id", slot.job_id)
    .maybeSingle()) as any;

  if (jobError) throw new Error(jobError.message);
  if (!job) return null;

  const { data: property, error: propertyError } = await service
    .from("properties")
    .select("name,address")
    .eq("id", job.property_id)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);

  return {
    slotId: slot.id,
    jobId: slot.job_id,
    kind,
    status: slot.status || null,
    jobDate: kind === "cleaner" ? getCleanerJobDate(job) : job.scheduled_for || null,
    jobNotes: job.notes || null,
    jobType: job.job_type || null,
    propertyName: property?.name || property?.address || "Property",
    propertyAddress: property?.address || null,
    accountLabel:
      String(account?.display_name || "").trim() ||
      String(account?.email || "").trim() ||
      (kind === "cleaner" ? "Cleaner team" : "Grounds team"),
  };
}

export async function refreshJobStaffing(service: ServiceClient, kind: JobNotificationKind, jobId: string) {
  const jobTable = getJobTable(kind);
  const slotTable = getSlotTable(kind);
  const accountIdColumn = getAccountIdColumn(kind);
  const unitsColumn = getUnitsColumn(kind);

  const { data: job, error: jobError } = await (service
    .from(jobTable as any)
    .select(`id, ${unitsColumn}`)
    .eq("id", jobId)
    .maybeSingle()) as any;

  if (jobError) throw new Error(jobError.message);
  if (!job) return;

  const { data: slots, error: slotError } = await (service
    .from(slotTable as any)
    .select(`id, status, ${accountIdColumn}, accepted_at, offered_at`)
    .eq("job_id", jobId)) as any;

  if (slotError) throw new Error(slotError.message);

  const slotRows = slots ?? [];
  const unitsNeeded = Math.max(1, Number(job[unitsColumn] || 1));
  const activeStatuses = getActiveStatuses(kind);
  const activeSlots = slotRows.filter((slot: any) => activeStatuses.includes(String(slot.status || "").toLowerCase()));
  const completedSlots = slotRows.filter((slot: any) => slot.status === "completed");
  const offeredSlots = slotRows.filter((slot: any) => slot.status === "offered");
  const stillStranded = slotRows.some((slot: any) => slot.status === "stranded" || !slot[accountIdColumn]);

  const staffingStatus = stillStranded
    ? "stranded"
    : activeSlots.length >= unitsNeeded
      ? "fully_staffed"
      : activeSlots.length > 0 || offeredSlots.length > 0
        ? "partially_filled"
        : "unassigned";

  const status =
    kind === "cleaner" && completedSlots.length >= unitsNeeded
      ? "completed"
      : activeSlots.some((slot: any) => slot.status === "in_progress")
        ? "in_progress"
        : activeSlots.length > 0
          ? "accepted"
          : offeredSlots.length > 0
            ? "offered"
            : "open";

  const earliestOfferedAt =
    offeredSlots
      .map((slot: any) => slot.offered_at)
      .filter(Boolean)
      .sort()[0] || null;
  const earliestAcceptedAt =
    activeSlots
      .map((slot: any) => slot.accepted_at)
      .filter(Boolean)
      .sort()[0] || null;

  const { error: updateError } = await (service
    .from(jobTable as any)
    .update({
      status,
      staffing_status: staffingStatus,
      offered_at: earliestOfferedAt,
      accepted_at: earliestAcceptedAt,
    })
    .eq("id", jobId)) as any;

  if (updateError) throw new Error(updateError.message);
}

export function buildJobCalendarIcs(details: SlotDetails, origin: string) {
  const date = details.jobDate || new Date().toISOString().slice(0, 10);
  const start = new Date(`${date}T11:00:00`);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = new Date();

  const format = (value: Date) =>
    `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}T${String(value.getHours()).padStart(2, "0")}${String(value.getMinutes()).padStart(2, "0")}00`;

  const escapeText = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

  const title = details.kind === "cleaner"
    ? `Cleaning - ${details.propertyName}`
    : `Grounds job - ${details.propertyName}`;
  const description = [
    details.jobNotes,
    `Team / account: ${details.accountLabel}`,
    `Open portal: ${origin}/${details.kind}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gulera OS//Job Notifications//EN",
    "BEGIN:VEVENT",
    `UID:${details.kind}-${details.slotId}@gulera-os`,
    `DTSTAMP:${format(stamp)}`,
    `DTSTART:${format(start)}`,
    `DTEND:${format(end)}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(details.propertyAddress || details.propertyName)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
