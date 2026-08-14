import { NextRequest, NextResponse } from "next/server";
import { requireAiCopilotAccess, getAiCopilotBearerToken } from "@/lib/server/ai-copilot-access";
import { sendOwnerInvoiceReminderEmail } from "@/lib/server/owner-invoice-reminders";
import { sendDirectProfileChatMessage } from "@/lib/server/direct-profile-chat";
import { sendStaffPushNotifications } from "@/lib/server/staff-push-notifications";
import { sendJobOfferEmailsForSlots } from "@/lib/server/job-notifications";
import { getCleanerOfferExpiresAtForDailySweep } from "@/lib/server/cleaner-offer-deadlines";
import { isMissingAuditLogTableError, writeAuditLog } from "@/lib/server/audit-log";
import { formatCurrency, normalizeCurrencyCode } from "@/lib/currency";
import {
  buildTurnoverRescuePlans,
  type RescueCleaner,
  type RescueHistorySlot,
  type RescueJob,
  type RescueSlot,
  type TurnoverRescueCandidate,
} from "@/lib/server/ai-turnover-rescue";
import {
  analyzeStaffingAnomalies,
  type SupervisorCleanerAssignment,
  type SupervisorStaffingJob,
  type SupervisorStaffingSlot,
  type SupervisorStatusEvent,
} from "@/lib/server/ai-supervisor-anomalies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  owner_account_id: string;
  property_id: string | null;
  status: string | null;
  due_date: string | null;
  total: number | null;
  currency_code?: string | null;
  last_reminder_sent_at?: string | null;
  reminder_count?: number | null;
};

type OwnerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type PropertyRow = {
  id: string;
  name: string | null;
  address: string | null;
};

type JobRow = {
  id: string;
  property_id: string;
  scheduled_for?: string | null;
  cleaner_units_needed?: number | null;
  status?: string | null;
  staffing_status?: string | null;
};

type JobSlotRow = {
  id: string;
  job_id: string;
  cleaner_account_id: string | null;
  status: string;
  offered_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
};

type PropertyKnowledgeRow = {
  property_id: string;
  guest_registration_required?: boolean | null;
  guest_registration_lead_days?: number | null;
  guest_registration_instructions?: string | null;
};

type BookingEventRow = {
  id: string;
  organization_id: string;
  property_id: string;
  summary: string | null;
  checkin_date: string;
  guest_registration_reminder_sent_at?: string | null;
  admin_note?: string | null;
};

type CleanerAccountRow = {
  id: string;
  display_name: string | null;
  active?: boolean | null;
};

type CleanerAccountMemberRow = {
  cleaner_account_id: string;
  profile_id: string;
};

type OrganizationMemberRow = {
  profile_id: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

type ProposedAction =
  | {
      id: string;
      kind: "turnover_rescue";
      priority: "high" | "medium";
      category: "Staffing";
      title: string;
      reason: string;
      recipientLabel: string;
      channelLabel: "Job offer";
      previewLabel: "Ranked recovery plan";
      previewText: string;
      canEditMessage: false;
      payload: {
        jobId: string;
        slotId: string;
        propertyId: string;
        propertyName: string;
        scheduledFor: string;
        candidates: TurnoverRescueCandidate[];
      };
    }
  | {
      id: string;
      kind: "invoice_reminder";
      priority: "high" | "medium";
      category: "Billing";
      title: string;
      reason: string;
      recipientLabel: string;
      channelLabel: string;
      previewLabel: string;
      previewText: string;
      canEditMessage: false;
      payload: {
        invoiceId: string;
      };
    }
  | {
      id: string;
      kind: "cleaner_follow_up";
      priority: "high" | "medium";
      category: "Staffing";
      title: string;
      reason: string;
      recipientLabel: string;
      channelLabel: string;
      previewLabel: string;
      previewText: string;
      canEditMessage: true;
      payload: {
        targetProfileId: string;
        propertyName: string;
        subject: string;
        jobId: string;
        slotId: string;
      };
    }
  | {
      id: string;
      kind: "guest_registration_reminder";
      priority: "high" | "medium";
      category: "Guest";
      title: string;
      reason: string;
      recipientLabel: string;
      channelLabel: string;
      previewLabel: string;
      previewText: string;
      canEditMessage: true;
      payload: {
        bookingEventId: string;
        propertyId: string;
        propertyName: string;
        checkinDate: string;
      };
    }
  | {
      id: string;
      kind: "staffing_advisory";
      priority: "high" | "medium";
      category: "Supervisor";
      title: string;
      reason: string;
      recipientLabel: "Admin team";
      channelLabel: "Review only";
      previewLabel: "Evidence and recommendation";
      previewText: string;
      canEditMessage: false;
      payload: {
        anomalyCode: string;
        jobId: string;
        propertyId: string;
        confidence: "high" | "medium";
        evidence: string[];
        recommendation: string;
      };
    };

function getTodayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function getStartOfDayIso(dateYmd: string) {
  return new Date(`${dateYmd}T00:00:00`).toISOString();
}

function addDaysYmd(baseYmd: string, days: number) {
  const date = new Date(`${baseYmd}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startYmd: string, endYmd: string) {
  const start = new Date(`${startYmd}T00:00:00`).getTime();
  const end = new Date(`${endYmd}T00:00:00`).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function formatShortDate(dateYmd: string) {
  const date = new Date(`${dateYmd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateYmd;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getActionError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function extractOutputText(data: unknown) {
  const payload = data as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  } | null;

  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }

  return chunks.join("\n").trim();
}

async function buildCleanerDraft(params: {
  cleanerName: string;
  propertyName: string;
  scheduledFor: string;
  urgency: "high" | "medium";
}) {
  const fallback = `Hi ${params.cleanerName}, can you please confirm the turnover for ${params.propertyName} on ${formatShortDate(
    params.scheduledFor
  )}? We are still waiting on acceptance in Gulera OS. Thanks.`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_HELP_MODEL || "gpt-5-mini",
        instructions:
          "Write a short property-management follow-up to a cleaner. Be warm, direct, and concise. Do not mention AI. Ask for confirmation. Keep it under 60 words.",
        input: `Cleaner: ${params.cleanerName}\nProperty: ${params.propertyName}\nScheduled date: ${params.scheduledFor}\nUrgency: ${params.urgency}`,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) return fallback;
    return extractOutputText(data) || fallback;
  } catch {
    return fallback;
  }
}

function buildGuestRegistrationDraft(params: {
  propertyName: string;
  guestLabel: string;
  checkinDate: string;
  leadDays: number;
  instructions: string;
}) {
  const intro =
    `${params.guestLabel} checks in at ${params.propertyName} on ${formatShortDate(params.checkinDate)}. ` +
    `Guest registration is due ${params.leadDays} day${params.leadDays === 1 ? "" : "s"} before arrival.`;
  const steps = params.instructions.trim()
    ? ` ${params.instructions.trim()}`
    : " Register the guest with the resort before arrival and confirm once complete.";

  return `${intro}${steps}`.trim();
}

async function refreshRescueJobStaffing(serviceClient: any, jobId: string) {
  const [{ data: job, error: jobError }, { data: slots, error: slotsError }] = await Promise.all([
    serviceClient.from("turnover_jobs").select("id,cleaner_units_needed").eq("id", jobId).maybeSingle(),
    serviceClient.from("turnover_job_slots").select("id,status,cleaner_account_id").eq("job_id", jobId),
  ]);
  if (jobError) throw new Error(jobError.message);
  if (slotsError) throw new Error(slotsError.message);
  if (!job) return;

  const rows = slots ?? [];
  const unitsNeeded = Math.max(1, Number(job.cleaner_units_needed || 1));
  const accepted = rows.filter((slot: { status?: string | null }) => ["accepted", "in_progress", "completed"].includes(String(slot.status || "").toLowerCase())).length;
  const offered = rows.filter((slot: { status?: string | null }) => String(slot.status || "").toLowerCase() === "offered").length;
  const stranded = rows.some((slot: { status?: string | null; cleaner_account_id?: string | null }) => String(slot.status || "").toLowerCase() === "stranded" || !slot.cleaner_account_id);
  const staffingStatus = accepted >= unitsNeeded
    ? "fully_staffed"
    : stranded
      ? "stranded"
      : accepted > 0 || offered > 0
        ? "partially_filled"
        : "unassigned";

  const { error } = await serviceClient
    .from("turnover_jobs")
    .update({
      status: accepted >= unitsNeeded ? "accepted" : offered > 0 ? "offered" : "open",
      staffing_status: staffingStatus,
      offered_at: offered > 0 ? new Date().toISOString() : null,
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

type OrganizationMemberProfileRow = {
  profile_id: string;
  role: string | null;
  profiles:
    | {
        id: string;
        email: string | null;
        full_name: string | null;
        role: string | null;
      }
    | Array<{
        id: string;
        email: string | null;
        full_name: string | null;
        role: string | null;
      }>
    | null;
};

function getDismissalCooldownMs(kind: ProposedAction["kind"]) {
  if (kind === "turnover_rescue") return 4 * 60 * 60 * 1000;
  if (kind === "invoice_reminder") return 7 * 24 * 60 * 60 * 1000;
  if (kind === "guest_registration_reminder") return 3 * 24 * 60 * 60 * 1000;
  if (kind === "staffing_advisory") return 24 * 60 * 60 * 1000;
  return 12 * 60 * 60 * 1000;
}

function getDismissalLabel(kind: ProposedAction["kind"]) {
  if (kind === "turnover_rescue") return "4 hours";
  if (kind === "invoice_reminder") return "7 days";
  if (kind === "guest_registration_reminder") return "3 days";
  if (kind === "staffing_advisory") return "24 hours";
  return "12 hours";
}

async function getSnoozedActionIds(serviceClient: any, organizationId: string, actions: ProposedAction[]) {
  if (actions.length === 0) return new Set<string>();

  const actionsById = new Map(actions.map((action) => [action.id, action]));
  const longestCooldownMs = Math.max(...actions.map((action) => getDismissalCooldownMs(action.kind)));
  const oldestRelevantDismissalIso = new Date(Date.now() - longestCooldownMs).toISOString();

  const { data, error } = await serviceClient
    .from("audit_logs")
    .select("target_id, created_at")
    .eq("organization_id", organizationId)
    .in("action_type", ["ai.supervisor.dismissed", "ai.supervisor.advisory_reviewed"])
    .gte("created_at", oldestRelevantDismissalIso)
    .in("target_id", actions.map((action) => action.id));

  if (error) {
    if (isMissingAuditLogTableError(error)) return new Set<string>();
    throw new Error(error.message);
  }

  const nowMs = Date.now();
  const snoozedActionIds = new Set<string>();

  for (const row of (data ?? []) as Array<{ target_id?: string | null; created_at?: string | null }>) {
    const actionId = String(row.target_id || "");
    const action = actionsById.get(actionId);
    if (!action || !row.created_at) continue;

    const dismissedAtMs = new Date(row.created_at).getTime();
    if (Number.isNaN(dismissedAtMs)) continue;
    if (nowMs - dismissedAtMs < getDismissalCooldownMs(action.kind)) {
      snoozedActionIds.add(actionId);
    }
  }

  return snoozedActionIds;
}

async function generateActions(organizationId: string, token: string) {
  const { serviceClient } = await requireAiCopilotAccess({ token, organizationId });
  const todayYmd = getTodayYmd();
  const tomorrowYmd = addDaysYmd(todayYmd, 1);
  const anomalyEndYmd = addDaysYmd(todayYmd, 90);

  const [
    invoicesRes,
    ownersRes,
    propertiesRes,
    cleanerAccountsRes,
    cleanerMembersRes,
    memberProfilesRes,
    knowledgeRes,
  ] = await Promise.all([
    serviceClient
      .from("owner_invoices")
      .select("id,invoice_number,owner_account_id,property_id,status,due_date,total,last_reminder_sent_at,reminder_count")
      .eq("organization_id", organizationId)
      .eq("status", "sent")
      .order("due_date", { ascending: true })
      .limit(30),
    serviceClient
      .from("owner_accounts")
      .select("id,full_name,email")
      .eq("organization_id", organizationId),
    serviceClient
      .from("properties")
      .select("id,name,address")
      .eq("organization_id", organizationId),
    serviceClient
      .from("cleaner_accounts")
      .select("id,display_name,active")
      .eq("organization_id", organizationId),
    serviceClient
      .from("cleaner_account_members")
      .select("cleaner_account_id,profile_id"),
    serviceClient
      .from("organization_members")
      .select(`
        profile_id,
        role,
        profiles!organization_members_profile_id_fkey (
          id,
          email,
          full_name,
          role
        )
      `)
      .eq("organization_id", organizationId)
      .in("role", ["cleaner", "grounds", "admin"]),
    serviceClient
      .from("property_knowledge")
      .select("property_id, guest_registration_required, guest_registration_lead_days, guest_registration_instructions")
      .eq("organization_id", organizationId)
      .eq("guest_registration_required", true),
  ]);

  for (const result of [invoicesRes, ownersRes, propertiesRes, cleanerAccountsRes, cleanerMembersRes, memberProfilesRes, knowledgeRes]) {
    if (result.error) throw new Error(result.error.message);
  }

  const anomalyJobsRes = await serviceClient
    .from("turnover_jobs")
    .select("id,property_id,scheduled_for,cleaner_units_needed,status,staffing_status")
    .eq("organization_id", organizationId)
    .gte("scheduled_for", todayYmd)
    .lte("scheduled_for", anomalyEndYmd)
    .order("scheduled_for", { ascending: true })
    .limit(300);
  if (anomalyJobsRes.error) throw new Error(anomalyJobsRes.error.message);

  const anomalyJobs = (anomalyJobsRes.data ?? []) as SupervisorStaffingJob[];
  const anomalyJobIds = anomalyJobs.map((job) => job.id);
  const anomalyPropertyIds = [...new Set(anomalyJobs.map((job) => job.property_id))];
  const [anomalySlotsRes, anomalyAssignmentsRes, anomalyStatusEventsRes] = await Promise.all([
    anomalyJobIds.length > 0
      ? serviceClient
          .from("turnover_job_slots")
          .select("id,job_id,cleaner_account_id,status,offered_at,accepted_at,declined_at,expires_at,created_at")
          .in("job_id", anomalyJobIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    anomalyPropertyIds.length > 0
      ? serviceClient
          .from("property_cleaner_account_assignments")
          .select("property_id,cleaner_account_id,priority")
          .in("property_id", anomalyPropertyIds)
      : Promise.resolve({ data: [], error: null }),
    anomalyJobIds.length > 0
      ? serviceClient
          .from("staff_job_status_events")
          .select("job_id,account_id,event_type,created_at,push_sent_count,push_errors")
          .eq("job_kind", "cleaner")
          .in("job_id", anomalyJobIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [anomalySlotsRes, anomalyAssignmentsRes, anomalyStatusEventsRes]) {
    if (result.error) throw new Error(result.error.message);
  }

  const cleanerAccountIds = ((cleanerAccountsRes.data ?? []) as CleanerAccountRow[]).map((account) => account.id);
  const historySlotsRes = cleanerAccountIds.length > 0
    ? await serviceClient
        .from("turnover_job_slots")
        .select("cleaner_account_id,status")
        .in("cleaner_account_id", cleanerAccountIds)
        .in("status", ["accepted", "in_progress", "completed", "declined"])
        .limit(2000)
    : { data: [], error: null };
  if (historySlotsRes.error) throw new Error(historySlotsRes.error.message);

  const owners = new Map(
    ((ownersRes.data ?? []) as OwnerRow[]).map((owner) => [owner.id, owner])
  );
  const properties = new Map(
    ((propertiesRes.data ?? []) as PropertyRow[]).map((property) => [property.id, property])
  );
  const jobs = new Map(
    anomalyJobs
      .filter((job) => job.scheduled_for && [todayYmd, tomorrowYmd].includes(job.scheduled_for))
      .map((job) => [job.id, job as JobRow])
  );
  const cleanerAccounts = new Map(
    ((cleanerAccountsRes.data ?? []) as CleanerAccountRow[]).map((account) => [account.id, account])
  );

  const profiles = new Map<string, ProfileRow>();
  for (const member of (memberProfilesRes.data ?? []) as OrganizationMemberProfileRow[]) {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    if (profile?.id) {
      profiles.set(String(profile.id), {
        id: String(profile.id),
        email: profile.email ?? null,
        full_name: profile.full_name ?? null,
        role: member.role ?? profile.role ?? null,
      });
    }
  }

  const memberProfileIdByCleanerAccount = new Map<string, string>();
  for (const member of (cleanerMembersRes.data ?? []) as CleanerAccountMemberRow[]) {
    if (!memberProfileIdByCleanerAccount.has(member.cleaner_account_id) && profiles.has(member.profile_id)) {
      memberProfileIdByCleanerAccount.set(member.cleaner_account_id, member.profile_id);
    }
  }

  const actions: ProposedAction[] = [];
  const propertyNames = new Map(
    ((propertiesRes.data ?? []) as PropertyRow[]).map((property) => [
      property.id,
      property.name || property.address || `Property ${property.id.slice(0, 8)}`,
    ])
  );
  const { plans: turnoverRescuePlans, coverage: turnoverCoverage } = buildTurnoverRescuePlans({
    jobs: anomalyJobs as RescueJob[],
    slots: (anomalySlotsRes.data ?? []) as RescueSlot[],
    assignments: (anomalyAssignmentsRes.data ?? []) as SupervisorCleanerAssignment[],
    cleaners: (cleanerAccountsRes.data ?? []) as RescueCleaner[],
    members: (cleanerMembersRes.data ?? []) as CleanerAccountMemberRow[],
    historySlots: (historySlotsRes.data ?? []) as RescueHistorySlot[],
    propertyNames,
    profileNames: new Map(
      Array.from(profiles.values()).map((profile) => [profile.id, profile.full_name || profile.email || "Cleaner"])
    ),
    todayYmd,
    tomorrowYmd,
  });

  for (const plan of turnoverRescuePlans) {
    const topCandidate = plan.candidates[0];
    actions.push({
      id: `turnover-rescue-${plan.jobId}-${plan.slotId}`,
      kind: "turnover_rescue",
      priority: plan.urgency,
      category: "Staffing",
      title: `Rescue coverage for ${plan.propertyName}`,
      reason: `${plan.propertyName} still needs cleaner coverage for ${plan.scheduledFor === todayYmd ? "today" : "tomorrow"}.${plan.excludedConflictCount > 0 ? ` ${plan.excludedConflictCount} assigned cleaner${plan.excludedConflictCount === 1 ? " was" : "s were"} excluded for same-day conflicts.` : ""}`,
      recipientLabel: topCandidate?.cleanerName || "No eligible cleaner found",
      channelLabel: "Job offer",
      previewLabel: "Ranked recovery plan",
      previewText: topCandidate
        ? `Offer the open slot to ${topCandidate.cleanerName}. The co-pilot ranked ${plan.candidates.length} eligible candidate${plan.candidates.length === 1 ? "" : "s"} after checking property priority, response history, prior declines, and same-day accepted jobs.`
        : "No eligible assigned cleaner remains. Add a backup cleaner or choose an external coverage path before approving a job offer.",
      canEditMessage: false,
      payload: {
        jobId: plan.jobId,
        slotId: plan.slotId,
        propertyId: plan.propertyId,
        propertyName: plan.propertyName,
        scheduledFor: plan.scheduledFor,
        candidates: plan.candidates,
      },
    });
  }
  const rescueJobIds = new Set(turnoverRescuePlans.map((plan) => plan.jobId));

  const staffingAnomalies = analyzeStaffingAnomalies({
    jobs: anomalyJobs,
    slots: (anomalySlotsRes.data ?? []) as SupervisorStaffingSlot[],
    assignments: (anomalyAssignmentsRes.data ?? []) as SupervisorCleanerAssignment[],
    statusEvents: (anomalyStatusEventsRes.data ?? []) as SupervisorStatusEvent[],
    cleanerNames: new Map(
      ((cleanerAccountsRes.data ?? []) as CleanerAccountRow[]).map((account) => [
        account.id,
        account.display_name || `Cleaner ${account.id.slice(0, 8)}`,
      ])
    ),
    propertyNames,
  });

  for (const anomaly of staffingAnomalies.slice(0, 8)) {
    if (rescueJobIds.has(anomaly.jobId) && ["expired_offer", "stranded_without_admin_event", "stranded_notification_failed"].includes(anomaly.code)) {
      continue;
    }
    actions.push({
      id: anomaly.id,
      kind: "staffing_advisory",
      priority: anomaly.priority,
      category: "Supervisor",
      title: anomaly.title,
      reason: anomaly.reason,
      recipientLabel: "Admin team",
      channelLabel: "Review only",
      previewLabel: "Evidence and recommendation",
      previewText: [
        `Confidence: ${anomaly.confidence}`,
        ...anomaly.evidence.map((item) => `Evidence: ${item}`),
        `Recommendation: ${anomaly.recommendation}`,
      ].join("\n"),
      canEditMessage: false,
      payload: {
        anomalyCode: anomaly.code,
        jobId: anomaly.jobId,
        propertyId: anomaly.propertyId,
        confidence: anomaly.confidence,
        evidence: anomaly.evidence,
        recommendation: anomaly.recommendation,
      },
    });
  }

  for (const invoice of (invoicesRes.data ?? []) as InvoiceRow[]) {
    if (!invoice.due_date) continue;
    const overdueDays = daysBetween(invoice.due_date, todayYmd);
    if (overdueDays < 0) continue;

    const remindedRecently =
      invoice.last_reminder_sent_at &&
      daysBetween(invoice.last_reminder_sent_at.slice(0, 10), todayYmd) < 3;
    if (remindedRecently) continue;

    const owner = owners.get(invoice.owner_account_id);
    const property = invoice.property_id ? properties.get(invoice.property_id) : null;
    actions.push({
      id: `invoice-${invoice.id}`,
      kind: "invoice_reminder",
      priority: overdueDays >= 7 ? "high" : "medium",
      category: "Billing",
      title: `Chase overdue invoice ${invoice.invoice_number || ""}`.trim(),
      reason: `${owner?.full_name || owner?.email || "Owner"} is ${overdueDays === 0 ? "due today" : `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`} for ${formatCurrency(invoice.total, normalizeCurrencyCode(invoice.currency_code))}${property ? ` at ${property.name || property.address || "this property"}` : ""}.`,
      recipientLabel: owner?.full_name || owner?.email || "Owner",
      channelLabel: "Owner email",
      previewLabel: "Approval will send",
      previewText: `The existing standard invoice reminder email for ${invoice.invoice_number || "this invoice"}.`,
      canEditMessage: false,
      payload: {
        invoiceId: invoice.id,
      },
    });
  }

  const cleanerCandidates: Array<{
    slotId: string;
    jobId: string;
    cleanerName: string;
    targetProfileId: string;
    propertyName: string;
    scheduledFor: string;
    priority: "high" | "medium";
    reason: string;
  }> = [];

  for (const slot of (anomalySlotsRes.data ?? []) as JobSlotRow[]) {
    if (!slot.cleaner_account_id) continue;
    if (String(slot.status || "").toLowerCase() !== "offered") continue;
    if (slot.expires_at && new Date(slot.expires_at).getTime() <= Date.now()) continue;
    const job = jobs.get(slot.job_id);
    if (!job?.scheduled_for) continue;

    const targetProfileId = memberProfileIdByCleanerAccount.get(slot.cleaner_account_id);
    if (!targetProfileId) continue;

    const property = properties.get(job.property_id);
    const cleaner = cleanerAccounts.get(slot.cleaner_account_id);
    const isToday = job.scheduled_for === todayYmd;
    cleanerCandidates.push({
      slotId: slot.id,
      jobId: slot.job_id,
      cleanerName:
        cleaner?.display_name ||
        profiles.get(targetProfileId)?.full_name ||
        profiles.get(targetProfileId)?.email ||
        "Cleaner",
      targetProfileId,
      propertyName: property?.name || property?.address || "Unknown property",
      scheduledFor: job.scheduled_for,
      priority: isToday ? "high" : "medium",
      reason: `${property?.name || property?.address || "This property"} still has an unaccepted cleaner slot for ${isToday ? "today" : "tomorrow"}.`,
    });
  }

  for (const candidate of cleanerCandidates.slice(0, 4)) {
    const draft = await buildCleanerDraft({
      cleanerName: candidate.cleanerName,
      propertyName: candidate.propertyName,
      scheduledFor: candidate.scheduledFor,
      urgency: candidate.priority,
    });

    actions.push({
      id: `cleaner-${candidate.slotId}`,
      kind: "cleaner_follow_up",
      priority: candidate.priority,
      category: "Staffing",
      title: `Follow up with ${candidate.cleanerName}`,
      reason: candidate.reason,
      recipientLabel: candidate.cleanerName,
      channelLabel: "Cleaner chat",
      previewLabel: "Draft message",
      previewText: draft,
      canEditMessage: true,
      payload: {
        targetProfileId: candidate.targetProfileId,
        propertyName: candidate.propertyName,
        subject: `Turnover follow-up: ${candidate.propertyName}`,
        jobId: candidate.jobId,
        slotId: candidate.slotId,
      },
    });
  }

  const guestRegistrationConfigs = (knowledgeRes.data ?? []) as PropertyKnowledgeRow[];
  if (guestRegistrationConfigs.length > 0) {
    const leadDaysByPropertyId = new Map(
      guestRegistrationConfigs.map((row) => [
        row.property_id,
        Math.max(0, Math.min(30, Number(row.guest_registration_lead_days || 3))),
      ])
    );

    const targetCheckinDates = Array.from(
      new Set(Array.from(leadDaysByPropertyId.values()).map((leadDays) => addDaysYmd(todayYmd, leadDays)))
    );

    const propertyIds = Array.from(leadDaysByPropertyId.keys());
    const bookingsRes = await serviceClient
      .from("property_booking_events")
      .select("id, organization_id, property_id, summary, checkin_date, guest_registration_reminder_sent_at, admin_note")
      .eq("organization_id", organizationId)
      .in("property_id", propertyIds)
      .in("checkin_date", targetCheckinDates)
      .order("checkin_date", { ascending: true })
      .limit(20);

    if (bookingsRes.error) throw new Error(bookingsRes.error.message);

    for (const booking of (bookingsRes.data ?? []) as BookingEventRow[]) {
      const config = guestRegistrationConfigs.find((item) => item.property_id === booking.property_id);
      const property = properties.get(booking.property_id);
      if (!config || !property) continue;

      const leadDays = leadDaysByPropertyId.get(booking.property_id) ?? 3;
      if (booking.checkin_date !== addDaysYmd(todayYmd, leadDays)) continue;
      if (booking.guest_registration_reminder_sent_at) continue;

      const propertyName = property.name || property.address || "Property";
      const guestLabel = booking.summary?.trim() || "Upcoming guest";
      const instructions = String(config.guest_registration_instructions || "").trim();
      const previewText = buildGuestRegistrationDraft({
        propertyName,
        guestLabel,
        checkinDate: booking.checkin_date,
        leadDays,
        instructions,
      });

      actions.push({
        id: `guest-registration-${booking.id}`,
        kind: "guest_registration_reminder",
        priority: leadDays <= 1 ? "high" : "medium",
        category: "Guest",
        title: `Register guest for ${propertyName}`,
        reason: `${guestLabel} checks in on ${formatShortDate(booking.checkin_date)} and this property requires resort registration ${leadDays} day${leadDays === 1 ? "" : "s"} ahead of arrival.`,
        recipientLabel: "Admin team",
        channelLabel: "Booking note",
        previewLabel: "Approval will save this reminder",
        previewText,
        canEditMessage: true,
        payload: {
          bookingEventId: booking.id,
          propertyId: booking.property_id,
          propertyName,
          checkinDate: booking.checkin_date,
        },
      });
    }
  }

  const snoozedActionIds = await getSnoozedActionIds(
    serviceClient,
    organizationId,
    actions
  );

  const pendingActions = actions
    .filter((action) => !snoozedActionIds.has(action.id))
    .sort((a, b) => {
      const priorityRank = { high: 0, medium: 1 };
      return priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title);
    });
  const visibleActions = pendingActions.slice(0, 8);

  return {
    actions: visibleActions,
    brief: {
      needsActionNow: pendingActions.filter((action) => action.priority === "high").length,
      atRisk: pendingActions.filter((action) => action.priority === "medium").length,
      waiting: turnoverCoverage.waiting,
      covered: turnoverCoverage.resolved,
      generatedAt: new Date().toISOString(),
    },
  };
}

async function notifyHighPriorityActions(options: {
  organizationId: string;
  origin: string;
  actions: ProposedAction[];
  token: string;
}) {
  const highPriorityActions = options.actions.filter((action) => action.priority === "high");
  if (highPriorityActions.length === 0) return;

  const { serviceClient, profile } = await requireAiCopilotAccess({
    token: options.token,
    organizationId: options.organizationId,
  });

  const todayYmd = getTodayYmd();
  const actionIds = highPriorityActions.map((action) => action.id);
  const { data: existingLogs, error: logsError } = await serviceClient
    .from("audit_logs")
    .select("target_id")
    .eq("organization_id", options.organizationId)
    .eq("action_type", "ai.supervisor.high_priority_push")
    .gte("created_at", getStartOfDayIso(todayYmd))
    .in("target_id", actionIds);

  if (logsError) {
    if (isMissingAuditLogTableError(logsError)) return;
    throw new Error(logsError.message);
  }

  const alreadyNotified = new Set((existingLogs ?? []).map((row: { target_id?: string | null }) => String(row.target_id || "")));
  const pendingActions = highPriorityActions.filter((action) => !alreadyNotified.has(action.id));
  if (pendingActions.length === 0) return;

  const { data: adminMembers, error: adminMembersError } = await serviceClient
    .from("organization_members")
    .select("profile_id")
    .eq("organization_id", options.organizationId)
    .eq("role", "admin");

  if (adminMembersError) {
    throw new Error(adminMembersError.message);
  }

  const adminProfileIds = Array.from(
    new Set(((adminMembers ?? []) as OrganizationMemberRow[]).map((member) => String(member.profile_id || "")).filter(Boolean))
  );
  if (adminProfileIds.length === 0) return;

  const topAction = pendingActions[0];
  const body =
    pendingActions.length === 1
      ? `${topAction.title} is waiting for approval.`
      : `${pendingActions.length} high-priority AI actions are waiting for approval. Top item: ${topAction.title}.`;

  await sendStaffPushNotifications("admin", adminProfileIds, {
    title: "AI supervisor approval needed",
    body,
    url: `${options.origin}/admin`,
    tag: `ai-supervisor-high-${options.organizationId}-${todayYmd}`,
  });

  for (const action of pendingActions) {
    await writeAuditLog(serviceClient, {
      actorProfileId: profile.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      organizationId: options.organizationId,
      actionType: "ai.supervisor.high_priority_push",
      targetType: "ai_action",
      targetId: action.id,
      metadata: {
        kind: action.kind,
        priority: action.priority,
        category: action.category,
        title: action.title,
        recipientLabel: action.recipientLabel,
      },
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim() || "";
    const token = getAiCopilotBearerToken(request);

    if (!organizationId) {
      return NextResponse.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    }

    const { actions, brief } = await generateActions(organizationId, token);
    await notifyHighPriorityActions({
      organizationId,
      origin: request.nextUrl.origin,
      actions,
      token,
    });
    return NextResponse.json({ ok: true, actions, brief });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getActionError(error, "Could not load AI actions.") },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getAiCopilotBearerToken(request);
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const mode = String(body?.mode || "approve").trim();
    const confirmed = body?.confirmed === true;
    const kind = String(body?.kind || "").trim();
    const actionId = String(body?.actionId || "").trim();
    const draftMessage = String(body?.draftMessage || "").trim();
    const payload = body?.payload || {};

    if (!organizationId) {
      return NextResponse.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    }

    const { serviceClient, profile } = await requireAiCopilotAccess({ token, organizationId });

    if (mode === "dismiss") {
      if (!actionId || !kind) {
        return NextResponse.json({ ok: false, error: "Action details are required." }, { status: 400 });
      }

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId,
        actionType: "ai.supervisor.dismissed",
        targetType: "ai_action",
        targetId: actionId,
        metadata: {
          kind,
          snooze_for: getDismissalLabel(kind as ProposedAction["kind"]),
          payload,
        },
      });

      return NextResponse.json({
        ok: true,
        message: `Action dismissed for ${getDismissalLabel(kind as ProposedAction["kind"])}.`,
      });
    }

    if (mode !== "approve" || !confirmed || !actionId || !kind) {
      return NextResponse.json(
        { ok: false, error: "Explicit admin confirmation and complete action details are required." },
        { status: 400 }
      );
    }

    if (kind === "turnover_rescue") {
      const jobId = String(payload?.jobId || "").trim();
      const slotId = String(payload?.slotId || "").trim();
      const selectedCandidateAccountId = String(body?.selectedCandidateAccountId || "").trim();
      if (!jobId || !slotId || !selectedCandidateAccountId) {
        return NextResponse.json({ ok: false, error: "Choose a ranked cleaner before approving this rescue plan." }, { status: 400 });
      }

      const [{ data: job, error: jobError }, { data: slot, error: slotError }] = await Promise.all([
        serviceClient
          .from("turnover_jobs")
          .select("id,organization_id,property_id,scheduled_for,status")
          .eq("id", jobId)
          .eq("organization_id", organizationId)
          .maybeSingle(),
        serviceClient
          .from("turnover_job_slots")
          .select("id,job_id,cleaner_account_id,status,offered_at,accepted_at,declined_at")
          .eq("id", slotId)
          .eq("job_id", jobId)
          .maybeSingle(),
      ]);
      if (jobError) throw new Error(jobError.message);
      if (slotError) throw new Error(slotError.message);
      if (!job || !slot) return NextResponse.json({ ok: false, error: "The turnover job or open slot no longer exists." }, { status: 404 });
      if (!job.scheduled_for) return NextResponse.json({ ok: false, error: "The turnover has no scheduled date." }, { status: 409 });
      if (["accepted", "in_progress", "completed"].includes(String(slot.status || "").toLowerCase())) {
        return NextResponse.json({ ok: false, error: "This slot is already covered. Refresh the co-pilot plan." }, { status: 409 });
      }

      const [
        { data: cleaner, error: cleanerError },
        { data: assignment, error: assignmentError },
        { data: priorDecline, error: priorDeclineError },
      ] = await Promise.all([
        serviceClient
          .from("cleaner_accounts")
          .select("id,display_name,active")
          .eq("id", selectedCandidateAccountId)
          .eq("organization_id", organizationId)
          .maybeSingle(),
        serviceClient
          .from("property_cleaner_account_assignments")
          .select("id,priority")
          .eq("property_id", job.property_id)
          .eq("cleaner_account_id", selectedCandidateAccountId)
          .maybeSingle(),
        serviceClient
          .from("turnover_job_slots")
          .select("id")
          .eq("job_id", jobId)
          .eq("cleaner_account_id", selectedCandidateAccountId)
          .eq("status", "declined")
          .limit(1)
          .maybeSingle(),
      ]);
      if (cleanerError) throw new Error(cleanerError.message);
      if (assignmentError) throw new Error(assignmentError.message);
      if (priorDeclineError) throw new Error(priorDeclineError.message);
      if (!cleaner || cleaner.active === false || !assignment) {
        return NextResponse.json({ ok: false, error: "That cleaner is no longer an active assignment for this property." }, { status: 409 });
      }
      if (priorDecline) {
        return NextResponse.json({ ok: false, error: "That cleaner already declined this turnover. Refresh for the next candidate." }, { status: 409 });
      }

      const { data: activeSlots, error: activeSlotsError } = await serviceClient
        .from("turnover_job_slots")
        .select("id,job_id")
        .eq("cleaner_account_id", selectedCandidateAccountId)
        .in("status", ["accepted", "in_progress"])
        .neq("id", slotId);
      if (activeSlotsError) throw new Error(activeSlotsError.message);
      if ((activeSlots ?? []).some((row: { job_id?: string | null }) => row.job_id === jobId)) {
        return NextResponse.json({ ok: false, error: "That cleaner is already active on another slot for this turnover." }, { status: 409 });
      }
      const activeJobIds = Array.from(new Set((activeSlots ?? []).map((row: { job_id?: string | null }) => row.job_id).filter(Boolean))) as string[];
      if (activeJobIds.length > 0) {
        const { data: conflictingJobs, error: conflictsError } = await serviceClient
          .from("turnover_jobs")
          .select("id")
          .in("id", activeJobIds)
          .eq("scheduled_for", job.scheduled_for)
          .limit(1);
        if (conflictsError) throw new Error(conflictsError.message);
        if ((conflictingJobs ?? []).length > 0) {
          return NextResponse.json({ ok: false, error: "That cleaner now has another accepted job on this date. Refresh for a new ranking." }, { status: 409 });
        }
      }

      const now = new Date();
      const offeredAt = now.toISOString();
      const expiresAt = getCleanerOfferExpiresAtForDailySweep(job.scheduled_for, now);
      const previousCleanerAccountId = slot.cleaner_account_id || null;
      const previousStatus = slot.status || null;
      const { data: updatedSlot, error: updateError } = await serviceClient
        .from("turnover_job_slots")
        .update({
          cleaner_account_id: selectedCandidateAccountId,
          status: "offered",
          offered_at: offeredAt,
          expires_at: expiresAt,
          accepted_at: null,
          declined_at: null,
          accepted_by_profile_id: null,
          declined_by_profile_id: null,
          offer_email_sent_at: null,
          offer_reminder_sent_at: null,
          day_of_reminder_sent_at: null,
          offer_push_sent_at: null,
          offer_reminder_push_sent_at: null,
          day_of_reminder_push_sent_at: null,
        })
        .eq("id", slotId)
        .eq("job_id", jobId)
        .not("status", "in", "(accepted,in_progress,completed)")
        .select("id")
        .maybeSingle();
      if (updateError) throw new Error(updateError.message);
      if (!updatedSlot) return NextResponse.json({ ok: false, error: "The slot changed before approval. Refresh the plan." }, { status: 409 });

      await refreshRescueJobStaffing(serviceClient, jobId);
      const notificationResult = await sendJobOfferEmailsForSlots("cleaner", [slotId], request.nextUrl.origin, {
        allowedOrganizationIds: new Set([organizationId]),
      });
      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId,
        actionType: "ai.supervisor.turnover_rescue_approved",
        targetType: "turnover_job_slot",
        targetId: slotId,
        metadata: {
          action_id: actionId,
          job_id: jobId,
          property_id: job.property_id,
          scheduled_for: job.scheduled_for,
          previous_cleaner_account_id: previousCleanerAccountId,
          previous_status: previousStatus,
          selected_cleaner_account_id: selectedCandidateAccountId,
          selected_cleaner_name: cleaner.display_name || null,
          assignment_priority: assignment.priority ?? null,
          offer_expires_at: expiresAt,
          notification_result: notificationResult,
        },
      });

      return NextResponse.json({
        ok: true,
        message: `Job offer sent to ${cleaner.display_name || "the selected cleaner"}. The co-pilot will keep it in Waiting until they respond.`,
      });
    }

    if (kind === "invoice_reminder") {
      const invoiceId = String(payload?.invoiceId || "").trim();
      if (!invoiceId) {
        return NextResponse.json({ ok: false, error: "Invoice is required." }, { status: 400 });
      }

      const result = await sendOwnerInvoiceReminderEmail({
        service: serviceClient,
        invoiceId,
        origin: request.nextUrl.origin,
        actorProfileId: profile.id,
        eventType: "reminder_sent",
      });

      return NextResponse.json({
        ok: true,
        message: `Standard reminder sent for invoice ${result.invoiceNumber}.`,
      });
    }

    if (kind === "cleaner_follow_up") {
      const targetProfileId = String(payload?.targetProfileId || "").trim();
      const subject = String(payload?.subject || "").trim();
      if (!targetProfileId || !draftMessage) {
        return NextResponse.json({ ok: false, error: "Cleaner and message are required." }, { status: 400 });
      }

      const result = await sendDirectProfileChatMessage({
        service: serviceClient,
        organizationId,
        senderProfileId: profile.id,
        senderLabel: profile.full_name || profile.email || "Admin",
        subject: subject || "Operations follow-up",
        body: draftMessage,
        targetProfileId,
      });

      return NextResponse.json({
        ok: true,
        message: `Chat follow-up sent to ${result.targetName}.`,
        conversationId: result.conversationId,
      });
    }

    if (kind === "guest_registration_reminder") {
      const bookingEventId = String(payload?.bookingEventId || "").trim();
      if (!bookingEventId || !draftMessage) {
        return NextResponse.json({ ok: false, error: "Booking and reminder note are required." }, { status: 400 });
      }

      const { data: booking, error: bookingError } = await serviceClient
        .from("property_booking_events")
        .select("id, summary, admin_note")
        .eq("id", bookingEventId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (bookingError) {
        return NextResponse.json({ ok: false, error: bookingError.message }, { status: 500 });
      }

      if (!booking) {
        return NextResponse.json({ ok: false, error: "Booking not found for this organization." }, { status: 404 });
      }

      const existingNote = String(booking.admin_note || "").trim();
      const nextNote = existingNote
        ? `${existingNote}\n\nAI supervisor reminder:\n${draftMessage}`
        : `AI supervisor reminder:\n${draftMessage}`;

      const { error: updateError } = await serviceClient
        .from("property_booking_events")
        .update({
          admin_note: nextNote,
          admin_note_important: true,
          guest_registration_reminder_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", bookingEventId)
        .eq("organization_id", organizationId);

      if (updateError) {
        return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: `Guest registration reminder saved to the booking note for ${booking.summary?.trim() || "the upcoming guest"}.`,
      });
    }

    if (kind === "staffing_advisory") {
      const jobId = String(payload?.jobId || "").trim();
      const anomalyCode = String(payload?.anomalyCode || "").trim();
      if (!jobId || !anomalyCode) {
        return NextResponse.json({ ok: false, error: "Supervisor finding details are required." }, { status: 400 });
      }

      await writeAuditLog(serviceClient, {
        actorProfileId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        organizationId,
        actionType: "ai.supervisor.advisory_reviewed",
        targetType: "ai_action",
        targetId: actionId,
        metadata: {
          action_id: actionId,
          anomaly_code: anomalyCode,
          job_id: jobId,
          property_id: payload?.propertyId || null,
          confidence: payload?.confidence || null,
          evidence: Array.isArray(payload?.evidence) ? payload.evidence : [],
          recommendation: payload?.recommendation || null,
        },
      });

      return NextResponse.json({
        ok: true,
        message: "Supervisor finding acknowledged and retained in the audit history.",
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown action type." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getActionError(error, "Could not approve AI action.") },
      { status: 500 }
    );
  }
}
