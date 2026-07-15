import type { JobNotificationKind } from "@/lib/server/job-notifications";
import { sendStaffPushNotifications } from "@/lib/server/staff-push-notifications";

type ServiceClient = any;
type AdminJobStatusEvent = "accepted" | "arrived" | "started" | "completed" | "overdue_offer";

function isOptionalEventTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("staff_job_status_events") ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}

function getJobTable(kind: JobNotificationKind) {
  return kind === "cleaner" ? "turnover_jobs" : "grounds_jobs";
}

function getAccountTable(kind: JobNotificationKind) {
  return kind === "cleaner" ? "cleaner_accounts" : "grounds_accounts";
}

function getJobLabel(kind: JobNotificationKind) {
  return kind === "cleaner" ? "Cleaning job" : "Grounds job";
}

function getTeamLabel(kind: JobNotificationKind) {
  return kind === "cleaner" ? "Cleaner" : "Grounds";
}

function getSlotTable(kind: JobNotificationKind) {
  return kind === "cleaner" ? "turnover_job_slots" : "grounds_job_slots";
}

function getAccountIdColumn(kind: JobNotificationKind) {
  return kind === "cleaner" ? "cleaner_account_id" : "grounds_account_id";
}

function getEventCopy(
  kind: JobNotificationKind,
  event: AdminJobStatusEvent,
  accountName: string,
  propertyName: string,
  options?: { expiresAt?: string | null }
) {
  const jobLabel = getJobLabel(kind);
  if (event === "overdue_offer") {
    const expiresAtLabel = options?.expiresAt
      ? new Date(options.expiresAt).toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "the expected response window";
    return {
      title: `${jobLabel} overdue`,
      body: `${accountName} has not responded to ${jobLabel.toLowerCase()} for ${propertyName}. Offer expired ${expiresAtLabel}.`,
    };
  }

  if (event === "arrived") {
    return {
      title: `${getTeamLabel(kind)} arrived`,
      body: `${accountName} arrived at ${propertyName} for ${jobLabel.toLowerCase()}.`,
    };
  }

  const verb = event === "accepted" ? "accepted" : event === "started" ? "started" : "completed";
  return {
    title: `${jobLabel} ${verb}`,
    body: `${accountName} ${verb} ${jobLabel.toLowerCase()} for ${propertyName}.`,
  };
}

export async function sendAdminJobStatusPush(
  service: ServiceClient,
  kind: JobNotificationKind,
  jobId: string,
  accountId: string | null,
  event: AdminJobStatusEvent,
  origin: string
) {
  const { data: job, error: jobError } = await (service
    .from(getJobTable(kind) as any)
    .select("id, organization_id, property_id")
    .eq("id", jobId)
    .maybeSingle()) as any;

  if (jobError || !job?.organization_id) {
    return { sent: 0, errors: jobError?.message ? [jobError.message] : [] };
  }

  const [{ data: account }, { data: property }, { data: adminMembers, error: adminError }] = await Promise.all([
    accountId
      ? service
          .from(getAccountTable(kind) as any)
          .select("display_name, email")
          .eq("id", accountId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    service
      .from("properties")
      .select("name")
      .eq("id", job.property_id)
      .maybeSingle(),
    service
      .from("organization_members")
      .select("profile_id")
      .eq("organization_id", job.organization_id)
      .eq("role", "admin"),
  ]);

  if (adminError) {
    return { sent: 0, errors: [adminError.message] };
  }

  const profileIds: string[] = [
    ...new Set<string>((adminMembers || []).map((row: any) => String(row.profile_id || "")).filter(Boolean)),
  ];
  const accountName =
    String(account?.display_name || "").trim() ||
    String(account?.email || "").trim() ||
    getTeamLabel(kind);
  const propertyName = property?.name || "a property";
  const { title, body } = getEventCopy(kind, event, accountName, propertyName);
  const url = `${origin}/admin?open=jobs&jobId=${encodeURIComponent(jobId)}`;

  const result = await sendStaffPushNotifications("admin", profileIds, {
    title,
    body,
    url,
    tag: `${kind}-job-${event}-${jobId}`,
  });

  const { error: eventError } = await service.from("staff_job_status_events").insert({
    organization_id: job.organization_id,
    job_kind: kind,
    job_id: jobId,
    account_id: accountId,
    event_type: event,
    title,
    body,
    url,
    push_sent_count: result.sent,
    push_errors: result.errors,
    metadata: {
      account_name: accountName,
      property_id: job.property_id,
      property_name: propertyName,
    },
  });

  const eventErrors = eventError && !isOptionalEventTableError(eventError) ? [eventError.message] : [];

  return { sent: result.sent, errors: [...result.errors, ...eventErrors], deliveries: result.deliveries };
}

export async function sendAdminOverdueOfferPush(
  service: ServiceClient,
  kind: JobNotificationKind,
  slotId: string,
  origin: string
) {
  const slotTable = getSlotTable(kind);
  const accountTable = getAccountTable(kind);
  const accountIdColumn = getAccountIdColumn(kind);

  const { data: slot, error: slotError } = await (service
    .from(slotTable as any)
    .select(`id, job_id, status, expires_at, ${accountIdColumn}`)
    .eq("id", slotId)
    .maybeSingle()) as any;

  if (slotError || !slot?.job_id) {
    return { sent: 0, errors: slotError?.message ? [slotError.message] : [] };
  }

  if (String(slot.status || "").toLowerCase().trim() !== "offered") {
    return { sent: 0, errors: [], skipped: true };
  }

  const expiresAt = slot.expires_at ? new Date(slot.expires_at) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() >= Date.now()) {
    return { sent: 0, errors: [], skipped: true };
  }

  const { data: existingEvents, error: existingEventsError } = await service
    .from("staff_job_status_events")
    .select("id, metadata")
    .eq("job_kind", kind)
    .eq("job_id", slot.job_id)
    .eq("event_type", "overdue_offer")
    .order("created_at", { ascending: false })
    .limit(20);

  if (existingEventsError && !isOptionalEventTableError(existingEventsError)) {
    return { sent: 0, errors: [existingEventsError.message] };
  }

  const duplicate = (existingEvents || []).some((event: any) => String(event?.metadata?.slot_id || "") === slotId);
  if (duplicate) {
    return { sent: 0, errors: [], skippedDuplicate: true };
  }

  const { data: job, error: jobError } = await (service
    .from(getJobTable(kind) as any)
    .select("id, organization_id, property_id")
    .eq("id", slot.job_id)
    .maybeSingle()) as any;

  if (jobError || !job?.organization_id) {
    return { sent: 0, errors: jobError?.message ? [jobError.message] : [] };
  }

  const [{ data: account }, { data: property }, { data: adminMembers, error: adminError }] = await Promise.all([
    slot[accountIdColumn]
      ? service
          .from(accountTable as any)
          .select("display_name, email")
          .eq("id", slot[accountIdColumn])
          .maybeSingle()
      : Promise.resolve({ data: null }),
    service
      .from("properties")
      .select("name")
      .eq("id", job.property_id)
      .maybeSingle(),
    service
      .from("organization_members")
      .select("profile_id")
      .eq("organization_id", job.organization_id)
      .eq("role", "admin"),
  ]);

  if (adminError) {
    return { sent: 0, errors: [adminError.message] };
  }

  const profileIds: string[] = [
    ...new Set<string>((adminMembers || []).map((row: any) => String(row.profile_id || "")).filter(Boolean)),
  ];
  const accountName =
    String(account?.display_name || "").trim() ||
    String(account?.email || "").trim() ||
    getTeamLabel(kind);
  const propertyName = property?.name || "a property";
  const { title, body } = getEventCopy(kind, "overdue_offer", accountName, propertyName, {
    expiresAt: slot.expires_at || null,
  });
  const url = `${origin}/admin?open=jobs&jobId=${encodeURIComponent(slot.job_id)}`;

  const result = await sendStaffPushNotifications("admin", profileIds, {
    title,
    body,
    url,
    tag: `${kind}-job-overdue-${slotId}`,
  });

  const { error: eventError } = await service.from("staff_job_status_events").insert({
    organization_id: job.organization_id,
    job_kind: kind,
    job_id: slot.job_id,
    account_id: slot[accountIdColumn] || null,
    event_type: "overdue_offer",
    title,
    body,
    url,
    push_sent_count: result.sent,
    push_errors: result.errors,
    metadata: {
      slot_id: slotId,
      account_name: accountName,
      property_id: job.property_id,
      property_name: propertyName,
      expires_at: slot.expires_at || null,
    },
  });

  const eventErrors = eventError && !isOptionalEventTableError(eventError) ? [eventError.message] : [];

  return { sent: result.sent, errors: [...result.errors, ...eventErrors], deliveries: result.deliveries };
}

export async function sendAdminApprovalRequestPush(
  service: ServiceClient,
  organizationId: string,
  payload: {
    title: string;
    body: string;
    url: string;
    tag: string;
  }
) {
  const { data: adminMembers, error: adminError } = await service
    .from("organization_members")
    .select("profile_id")
    .eq("organization_id", organizationId)
    .eq("role", "admin");

  if (adminError) {
    return { sent: 0, errors: [adminError.message] };
  }

  const profileIds: string[] = [
    ...new Set<string>((adminMembers || []).map((row: any) => String(row.profile_id || "")).filter(Boolean)),
  ];

  const result = await sendStaffPushNotifications("admin", profileIds, payload);
  return { sent: result.sent, errors: result.errors, deliveries: result.deliveries };
}
