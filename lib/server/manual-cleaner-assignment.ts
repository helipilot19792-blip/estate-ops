import { sendAdminApprovalRequestPush } from "@/lib/server/admin-job-status-notifications";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient;

type ManualAssignmentProperty = {
  cleaner_assignment_mode?: string | null;
  name?: string | null;
  address?: string | null;
};

export async function prepareManualCleanerAssignment(
  service: ServiceClient,
  params: {
    jobId: string;
    organizationId: string;
    property: ManualAssignmentProperty;
    scheduledFor: string | null;
    origin: string;
  }
) {
  if (params.property.cleaner_assignment_mode !== "manual") {
    return { manual: false, notification: null };
  }

  const { error: slotError } = await service
    .from("turnover_job_slots")
    .update({
      cleaner_account_id: null,
      status: "stranded",
      offered_at: null,
      expires_at: null,
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
    .eq("job_id", params.jobId);

  if (slotError) throw new Error(slotError.message);

  const { error: jobError } = await service
    .from("turnover_jobs")
    .update({
      status: "open",
      staffing_status: "stranded",
      offered_at: null,
      accepted_at: null,
    })
    .eq("id", params.jobId)
    .eq("organization_id", params.organizationId);

  if (jobError) throw new Error(jobError.message);

  const propertyName = params.property.name || params.property.address || "Property";
  const dateLabel = params.scheduledFor ? ` for ${params.scheduledFor}` : "";
  const notification = await sendAdminApprovalRequestPush(service, params.organizationId, {
    title: `Choose a cleaner for ${propertyName}`,
    body: `A cleaning${dateLabel} is ready for manual assignment. Select one of this property's cleaners to send the offer.`,
    url: `${params.origin}/admin?open=jobs&jobId=${encodeURIComponent(params.jobId)}`,
    tag: `manual-cleaner-assignment-${params.jobId}`,
  });

  return { manual: true, notification };
}
