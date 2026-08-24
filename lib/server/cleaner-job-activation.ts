import type { SupabaseClient } from "@supabase/supabase-js";
import { applyCleanerTrainingRotationToJob } from "@/lib/server/cleaner-training-rotation";
import { getCleanerOfferExpiresAtForDailySweep } from "@/lib/server/cleaner-offer-deadlines";
import {
  getCleanerOfferHoldDecision,
  getTodayYmd,
  normalizePropertyCleanerOfferLeadDays,
} from "@/lib/server/cleaner-offer-hold";
import {
  sendJobCancellationNotificationsForJobs,
  sendJobOfferEmailsForSlots,
} from "@/lib/server/job-notifications";
import { prepareManualCleanerAssignment } from "@/lib/server/manual-cleaner-assignment";

type ServiceClient = SupabaseClient;

type ActivationResult = {
  jobId: string;
  manual: boolean;
  offeredSlotIds: string[];
  notification: {
    sent: number;
    pushSent: number;
    skipped: number;
    errors: string[];
  };
};

async function seedTurnoverSlotPayouts(
  service: ServiceClient,
  jobId: string,
  defaultTurnoverPayout: number | null | undefined
) {
  const { error } = await service
    .from("turnover_job_slots")
    .update({
      payout_type: "standard",
      expected_payout_amount: Number(defaultTurnoverPayout || 0),
      payment_status: "unpaid",
      paid_amount: null,
      payout_notes: null,
      payment_notes: null,
      paid_at: null,
      payment_recorded_by_profile_id: null,
    })
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);
}

async function ensurePriorityOffersHaveDeadlines(
  service: ServiceClient,
  jobId: string,
  propertyId: string,
  scheduledFor: string | null
) {
  const { data: offerSlots, error: offerSlotsError } = await service
    .from("turnover_job_slots")
    .select("id, offered_at")
    .eq("job_id", jobId)
    .eq("status", "offered")
    .not("cleaner_account_id", "is", null);

  if (offerSlotsError) throw new Error(offerSlotsError.message);
  let offeredSlotIds = (offerSlots ?? []).map((slot) => slot.id).filter(Boolean);

  if (offeredSlotIds.length === 0) {
    const { data: slots, error: slotsError } = await service
      .from("turnover_job_slots")
      .select("id, slot_number")
      .eq("job_id", jobId)
      .order("slot_number", { ascending: true });
    if (slotsError) throw new Error(slotsError.message);

    const { data: assignments, error: assignmentsError } = await service
      .from("property_cleaner_account_assignments")
      .select("cleaner_account_id, priority, created_at")
      .eq("property_id", propertyId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });
    if (assignmentsError) throw new Error(assignmentsError.message);

    const cleanerAccountIds = [
      ...new Set((assignments ?? []).map((assignment) => assignment.cleaner_account_id).filter(Boolean)),
    ];
    if (cleanerAccountIds.length > 0) {
      const { data: accounts, error: accountsError } = await service
        .from("cleaner_accounts")
        .select("id, active")
        .in("id", cleanerAccountIds);
      if (accountsError) throw new Error(accountsError.message);

      const activeAccountIds = new Set(
        (accounts ?? []).filter((account) => account.active !== false).map((account) => account.id)
      );
      const activeAssignments = (assignments ?? []).filter((assignment) =>
        activeAccountIds.has(assignment.cleaner_account_id)
      );
      const assignableCount = Math.min((slots ?? []).length, activeAssignments.length);
      const offeredAt = new Date().toISOString();
      const expiresAt = getCleanerOfferExpiresAtForDailySweep(scheduledFor);

      for (let index = 0; index < assignableCount; index += 1) {
        const { data: updatedSlot, error: updateError } = await service
          .from("turnover_job_slots")
          .update({
            cleaner_account_id: activeAssignments[index].cleaner_account_id,
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
          .eq("id", slots![index].id)
          .select("id")
          .maybeSingle();
        if (updateError) throw new Error(updateError.message);
        if (updatedSlot?.id) offeredSlotIds.push(updatedSlot.id);
      }
    }
  }

  if (offeredSlotIds.length === 0) return [];

  const { error: alignExpiryError } = await service
    .from("turnover_job_slots")
    .update({ expires_at: getCleanerOfferExpiresAtForDailySweep(scheduledFor) })
    .in("id", offeredSlotIds);

  if (alignExpiryError) throw new Error(alignExpiryError.message);

  const firstOfferedAt = (offerSlots ?? [])
    .map((slot) => slot.offered_at)
    .filter(Boolean)
    .sort()[0] || new Date().toISOString();
  const { error: jobUpdateError } = await service
    .from("turnover_jobs")
    .update({
      status: "offered",
      staffing_status: "partially_filled",
      offered_at: firstOfferedAt,
      accepted_at: null,
    })
    .eq("id", jobId);

  if (jobUpdateError) throw new Error(jobUpdateError.message);
  return offeredSlotIds;
}

export async function activateCleanerJobOffer(
  service: ServiceClient,
  params: {
    jobId: string;
    origin: string;
    allowedOrganizationIds?: Set<string> | null;
  }
): Promise<ActivationResult> {
  const { data: job, error: jobError } = await service
    .from("turnover_jobs")
    .select("id, organization_id, property_id, scheduled_for")
    .eq("id", params.jobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) throw new Error("Cleaning job was not found.");
  if (
    params.allowedOrganizationIds &&
    !params.allowedOrganizationIds.has(job.organization_id)
  ) {
    throw new Error("Cleaning job is outside the allowed organization scope.");
  }

  const { data: property, error: propertyError } = await service
    .from("properties")
    .select("id, organization_id, name, address, default_turnover_payout, cleaner_assignment_mode")
    .eq("id", job.property_id)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);
  if (!property) throw new Error("Cleaning job property was not found.");

  const { data: existingSlots, error: existingSlotsError } = await service
    .from("turnover_job_slots")
    .select("id, status")
    .eq("job_id", job.id);

  if (existingSlotsError) throw new Error(existingSlotsError.message);
  const hasAcceptedWork = (existingSlots ?? []).some((slot) =>
    ["accepted", "in_progress", "completed"].includes(String(slot.status || "").toLowerCase())
  );
  if (hasAcceptedWork) {
    return {
      jobId: job.id,
      manual: false,
      offeredSlotIds: [],
      notification: { sent: 0, pushSent: 0, skipped: 1, errors: [] },
    };
  }

  if ((existingSlots ?? []).length === 0) {
    const { error: slotError } = await service.rpc("create_slots_for_job", {
      p_job_id: job.id,
    });
    if (slotError) throw new Error(`Slot creation failed: ${slotError.message}`);
  }

  await seedTurnoverSlotPayouts(service, job.id, property.default_turnover_payout);
  await applyCleanerTrainingRotationToJob(service, job.id);

  const manualAssignment = await prepareManualCleanerAssignment(service, {
    jobId: job.id,
    organizationId: job.organization_id,
    property,
    scheduledFor: job.scheduled_for,
    origin: params.origin,
  });

  const offeredSlotIds = manualAssignment.manual
    ? []
    : await ensurePriorityOffersHaveDeadlines(service, job.id, job.property_id, job.scheduled_for);
  const notification = offeredSlotIds.length > 0
    ? await sendJobOfferEmailsForSlots("cleaner", offeredSlotIds, params.origin, {
        allowedOrganizationIds: params.allowedOrganizationIds,
      })
    : {
        sent: 0,
        pushSent: 0,
        skipped: 0,
        errors: manualAssignment.manual
          ? []
          : ["No active cleaner assignment was available to offer this job."],
      };

  const { error: releaseUpdateError } = await service
    .from("turnover_jobs")
    .update({ offer_released_at: new Date().toISOString() })
    .eq("id", job.id);
  if (releaseUpdateError) throw new Error(releaseUpdateError.message);

  return {
    jobId: job.id,
    manual: manualAssignment.manual,
    offeredSlotIds,
    notification,
  };
}

export async function reconcilePropertyCleanerOfferHolds(
  service: ServiceClient,
  params: {
    propertyId: string;
    organizationId: string;
    origin: string;
    leadDays?: unknown;
  }
) {
  const { data: property, error: propertyError } = await service
    .from("properties")
    .select("id, organization_id, cleaner_offer_lead_days")
    .eq("id", params.propertyId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);
  if (!property) throw new Error("Property was not found.");

  const leadDays = normalizePropertyCleanerOfferLeadDays(
    params.leadDays ?? property.cleaner_offer_lead_days
  );
  const todayYmd = getTodayYmd();
  const { data: jobs, error: jobsError } = await service
    .from("turnover_jobs")
    .select("id, organization_id, property_id, scheduled_for, status, staffing_status")
    .eq("property_id", property.id)
    .eq("cleaner_offer_uses_property_default", true)
    .gte("scheduled_for", todayYmd);

  if (jobsError) throw new Error(jobsError.message);

  let held = 0;
  let released = 0;
  let preservedAccepted = 0;
  let notificationsSent = 0;
  let pushSent = 0;
  const errors: string[] = [];

  for (const job of jobs ?? []) {
    if (["cancelled", "completed"].includes(String(job.status || "").toLowerCase())) continue;
    const decision = getCleanerOfferHoldDecision(job.scheduled_for, leadDays, todayYmd);
    const { data: slots, error: slotsError } = await service
      .from("turnover_job_slots")
      .select("id, status")
      .eq("job_id", job.id);

    if (slotsError) {
      errors.push(`${job.id}: ${slotsError.message}`);
      continue;
    }

    const hasAcceptedWork = (slots ?? []).some((slot) =>
      ["accepted", "in_progress", "completed"].includes(String(slot.status || "").toLowerCase())
    );
    if (hasAcceptedWork) {
      preservedAccepted += 1;
      continue;
    }

    if (decision.held) {
      try {
        const hasCleanerOffer = (slots ?? []).some(
          (slot) => String(slot.status || "").toLowerCase() === "offered"
        );
        if (hasCleanerOffer) {
          const notification = await sendJobCancellationNotificationsForJobs(
            "cleaner",
            [job.id],
            params.origin,
            {
              allowedOrganizationIds: new Set([params.organizationId]),
              context: {
                reason: "offer_deferred",
                offerEligibleAt: decision.offerEligibleAt,
              },
            }
          );
          notificationsSent += notification.sent;
          pushSent += notification.pushSent;
          errors.push(...notification.errors.map((error) => `${job.id}: ${error}`));
        }

        if ((slots ?? []).length > 0) {
          const { error: deleteSlotsError } = await service
            .from("turnover_job_slots")
            .delete()
            .eq("job_id", job.id);
          if (deleteSlotsError) throw new Error(deleteSlotsError.message);
        }

        const { error: holdError } = await service
          .from("turnover_jobs")
          .update({
            status: "pending",
            staffing_status: "held",
            cleaner_offer_lead_days: leadDays,
            offer_eligible_at: decision.offerEligibleAt,
            offer_held_at: new Date().toISOString(),
            offer_released_at: null,
            offered_at: null,
            accepted_at: null,
          })
          .eq("id", job.id);
        if (holdError) throw new Error(holdError.message);
        held += 1;
      } catch (error) {
        errors.push(`${job.id}: ${error instanceof Error ? error.message : "Could not hold cleaner offer."}`);
      }
      continue;
    }

    const { error: metadataError } = await service
      .from("turnover_jobs")
      .update({
        cleaner_offer_lead_days: leadDays,
        offer_eligible_at: decision.offerEligibleAt,
      })
      .eq("id", job.id);
    if (metadataError) {
      errors.push(`${job.id}: ${metadataError.message}`);
      continue;
    }

    if (String(job.staffing_status || "").toLowerCase() === "held") {
      try {
        const activation = await activateCleanerJobOffer(service, {
          jobId: job.id,
          origin: params.origin,
          allowedOrganizationIds: new Set([params.organizationId]),
        });
        released += 1;
        notificationsSent += activation.notification.sent;
        pushSent += activation.notification.pushSent;
        errors.push(...activation.notification.errors.map((error) => `${job.id}: ${error}`));
      } catch (error) {
        errors.push(`${job.id}: ${error instanceof Error ? error.message : "Could not release cleaner offer."}`);
      }
    }
  }

  return { held, released, preservedAccepted, notificationsSent, pushSent, errors };
}

export async function reconcileAllPropertyCleanerOfferHolds(
  service: ServiceClient,
  origin: string
) {
  const { data: properties, error: propertiesError } = await service
    .from("properties")
    .select("id, organization_id, cleaner_offer_lead_days");
  if (propertiesError) throw new Error(propertiesError.message);

  const total = {
    held: 0,
    released: 0,
    preservedAccepted: 0,
    notificationsSent: 0,
    pushSent: 0,
    errors: [] as string[],
  };
  for (const property of properties ?? []) {
    try {
      const result = await reconcilePropertyCleanerOfferHolds(service, {
        propertyId: property.id,
        organizationId: property.organization_id,
        origin,
        leadDays: property.cleaner_offer_lead_days,
      });
      total.held += result.held;
      total.released += result.released;
      total.preservedAccepted += result.preservedAccepted;
      total.notificationsSent += result.notificationsSent;
      total.pushSent += result.pushSent;
      total.errors.push(...result.errors);
    } catch (error) {
      total.errors.push(
        `${property.id}: ${error instanceof Error ? error.message : "Could not reconcile cleaner offer holds."}`
      );
    }
  }
  return total;
}

export async function activateDueHeldCleanerJobs(
  service: ServiceClient,
  origin: string
) {
  const todayYmd = getTodayYmd();
  const { data: jobs, error: jobsError } = await service
    .from("turnover_jobs")
    .select("id, organization_id")
    .eq("staffing_status", "held")
    .lte("offer_eligible_at", todayYmd)
    .limit(200);
  if (jobsError) throw new Error(jobsError.message);

  let released = 0;
  let notificationsSent = 0;
  let pushSent = 0;
  const errors: string[] = [];
  for (const job of jobs ?? []) {
    const { data: claimedJob, error: claimError } = await service
      .from("turnover_jobs")
      .update({ staffing_status: "releasing" })
      .eq("id", job.id)
      .eq("staffing_status", "held")
      .select("id")
      .maybeSingle();
    if (claimError) {
      errors.push(`${job.id}: ${claimError.message}`);
      continue;
    }
    if (!claimedJob) continue;

    try {
      const activation = await activateCleanerJobOffer(service, {
        jobId: job.id,
        origin,
        allowedOrganizationIds: new Set([job.organization_id]),
      });
      released += 1;
      notificationsSent += activation.notification.sent;
      pushSent += activation.notification.pushSent;
      errors.push(...activation.notification.errors.map((error) => `${job.id}: ${error}`));
    } catch (error) {
      await service
        .from("turnover_jobs")
        .update({ staffing_status: "held" })
        .eq("id", job.id)
        .eq("staffing_status", "releasing");
      errors.push(`${job.id}: ${error instanceof Error ? error.message : "Could not release cleaner offer."}`);
    }
  }
  return { released, notificationsSent, pushSent, errors };
}
