import { NextRequest, NextResponse } from "next/server";
import { requireAiCopilotAccess, getAiCopilotBearerToken } from "@/lib/server/ai-copilot-access";
import { sendOwnerInvoiceReminderEmail } from "@/lib/server/owner-invoice-reminders";
import { sendDirectProfileChatMessage } from "@/lib/server/direct-profile-chat";

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
};

type JobSlotRow = {
  id: string;
  job_id: string;
  cleaner_account_id: string | null;
  status: string;
  offered_at?: string | null;
};

type CleanerAccountRow = {
  id: string;
  display_name: string | null;
};

type CleanerAccountMemberRow = {
  cleaner_account_id: string;
  profile_id: string;
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
      kind: "invoice_reminder";
      priority: "high" | "medium";
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
    };

function getTodayYmd() {
  return new Date().toISOString().slice(0, 10);
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

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
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

async function generateActions(organizationId: string, token: string) {
  const { serviceClient } = await requireAiCopilotAccess({ token, organizationId });
  const todayYmd = getTodayYmd();
  const tomorrowYmd = addDaysYmd(todayYmd, 1);

  const [
    invoicesRes,
    ownersRes,
    propertiesRes,
    jobsRes,
    slotsRes,
    cleanerAccountsRes,
    cleanerMembersRes,
    memberProfilesRes,
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
      .from("turnover_jobs")
      .select("id,property_id,scheduled_for")
      .eq("organization_id", organizationId)
      .in("scheduled_for", [todayYmd, tomorrowYmd]),
    serviceClient
      .from("turnover_job_slots")
      .select("id,job_id,cleaner_account_id,status,offered_at")
      .in("status", ["offered", "stranded"]),
    serviceClient
      .from("cleaner_accounts")
      .select("id,display_name")
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
  ]);

  for (const result of [invoicesRes, ownersRes, propertiesRes, jobsRes, slotsRes, cleanerAccountsRes, cleanerMembersRes, memberProfilesRes]) {
    if (result.error) throw new Error(result.error.message);
  }

  const owners = new Map(
    ((ownersRes.data ?? []) as OwnerRow[]).map((owner) => [owner.id, owner])
  );
  const properties = new Map(
    ((propertiesRes.data ?? []) as PropertyRow[]).map((property) => [property.id, property])
  );
  const jobs = new Map(((jobsRes.data ?? []) as JobRow[]).map((job) => [job.id, job]));
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
      title: `Chase overdue invoice ${invoice.invoice_number || ""}`.trim(),
      reason: `${owner?.full_name || owner?.email || "Owner"} is ${overdueDays === 0 ? "due today" : `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`} for ${formatCurrency(invoice.total)}${property ? ` at ${property.name || property.address || "this property"}` : ""}.`,
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

  for (const slot of (slotsRes.data ?? []) as JobSlotRow[]) {
    if (!slot.cleaner_account_id) continue;
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

  return actions
    .sort((a, b) => {
      const priorityRank = { high: 0, medium: 1 };
      return priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title);
    })
    .slice(0, 8);
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim() || "";
    const token = getAiCopilotBearerToken(request);

    if (!organizationId) {
      return NextResponse.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    }

    const actions = await generateActions(organizationId, token);
    return NextResponse.json({ ok: true, actions });
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
    const kind = String(body?.kind || "").trim();
    const draftMessage = String(body?.draftMessage || "").trim();
    const payload = body?.payload || {};

    if (!organizationId) {
      return NextResponse.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    }

    const { serviceClient, profile } = await requireAiCopilotAccess({ token, organizationId });

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

    return NextResponse.json({ ok: false, error: "Unknown action type." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getActionError(error, "Could not approve AI action.") },
      { status: 500 }
    );
  }
}
