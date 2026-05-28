import type { JobNotificationKind } from "@/lib/server/job-notifications";
import { sendStaffPushNotifications } from "@/lib/server/staff-push-notifications";

type ServiceClient = any;
type AdminJobStatusEvent = "accepted" | "started" | "completed";

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
  const jobLabel = getJobLabel(kind);
  const title = `${jobLabel} ${event}`;
  const body = `${accountName} ${event} ${jobLabel.toLowerCase()} for ${propertyName}.`;

  const result = await sendStaffPushNotifications("admin", profileIds, {
    title,
    body,
    url: `${origin}/admin?open=jobs&jobId=${encodeURIComponent(jobId)}`,
    tag: `${kind}-job-${event}-${jobId}`,
  });

  return { sent: result.sent, errors: result.errors, deliveries: result.deliveries };
}
