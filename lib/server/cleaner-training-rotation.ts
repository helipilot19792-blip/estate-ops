import { writeAuditLog } from "@/lib/server/audit-log";

type ServiceClient = any;

type TrainingRotationResult = {
  offeredSlotIds: string[];
  expiredSlotIds?: string[];
  strandedSlotIds?: string[];
  errors?: string[];
};

function extractCheckoutDate(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function getCleanerJobDate(job: { scheduled_for?: string | null; notes?: string | null }) {
  return job.scheduled_for || extractCheckoutDate(job.notes || null);
}

export function getCleanerOfferResponseWindowHours(jobDate: string | null, now = new Date()) {
  if (!jobDate) return 8;

  const job = new Date(`${jobDate}T12:00:00`);
  const diffHours = (job.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours > 24 * 7) return 48;
  if (diffHours > 48) return 8;
  return 2;
}

function getExpiresAt(jobDate: string | null, now = new Date()) {
  const responseHours = getCleanerOfferResponseWindowHours(jobDate, now);
  return new Date(now.getTime() + responseHours * 60 * 60 * 1000).toISOString();
}

async function refreshCleanerJobStaffing(service: ServiceClient, jobId: string) {
  const { data: job, error: jobError } = await service
    .from("turnover_jobs")
    .select("id, cleaner_units_needed")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) return;

  const { data: slots, error: slotError } = await service
    .from("turnover_job_slots")
    .select("id, status, cleaner_account_id, accepted_at, offered_at")
    .eq("job_id", jobId);

  if (slotError) throw new Error(slotError.message);

  const slotRows = slots ?? [];
  const unitsNeeded = Math.max(1, Number(job.cleaner_units_needed || 1));
  const activeSlots = slotRows.filter((slot: any) =>
    ["accepted", "in_progress", "completed"].includes(String(slot.status || "").toLowerCase())
  );
  const acceptedSlots = slotRows.filter((slot: any) =>
    ["accepted", "in_progress"].includes(String(slot.status || "").toLowerCase())
  );
  const completedSlots = slotRows.filter((slot: any) => slot.status === "completed");
  const offeredSlots = slotRows.filter((slot: any) => slot.status === "offered");
  const stillStranded = slotRows.some((slot: any) => slot.status === "stranded" || !slot.cleaner_account_id);

  const staffingStatus = stillStranded
    ? "stranded"
    : activeSlots.length >= unitsNeeded
      ? "fully_staffed"
      : activeSlots.length > 0 || offeredSlots.length > 0
        ? "partially_filled"
        : "unassigned";

  const status =
    completedSlots.length >= unitsNeeded
      ? "completed"
      : acceptedSlots.some((slot: any) => slot.status === "in_progress")
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
    acceptedSlots
      .map((slot: any) => slot.accepted_at)
      .filter(Boolean)
      .sort()[0] || null;

  const { error: updateError } = await service
    .from("turnover_jobs")
    .update({
      status,
      staffing_status: staffingStatus,
      offered_at: earliestOfferedAt,
      accepted_at: earliestAcceptedAt,
    })
    .eq("id", jobId);

  if (updateError) throw new Error(updateError.message);
}

async function loadActiveAssignments(service: ServiceClient, propertyId: string) {
  const { data: assignmentRows, error: assignmentError } = await service
    .from("property_cleaner_account_assignments")
    .select("id, cleaner_account_id, priority")
    .eq("property_id", propertyId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (assignmentError) throw new Error(assignmentError.message);

  const assignments = assignmentRows ?? [];
  const accountIds = assignments.map((assignment: any) => assignment.cleaner_account_id).filter(Boolean);
  if (accountIds.length === 0) return [];

  const { data: accountRows, error: accountError } = await service
    .from("cleaner_accounts")
    .select("id, active")
    .in("id", accountIds);

  if (accountError) throw new Error(accountError.message);

  const activeAccountIds = new Set(
    (accountRows ?? [])
      .filter((account: any) => account.active !== false)
      .map((account: any) => account.id)
  );

  return assignments.filter((assignment: any) => activeAccountIds.has(assignment.cleaner_account_id));
}

function rotateAssignments(assignments: any[], nextCleanerAccountId?: string | null) {
  const startIndex = nextCleanerAccountId
    ? assignments.findIndex((assignment: any) => assignment.cleaner_account_id === nextCleanerAccountId)
    : -1;

  return startIndex > 0
    ? [...assignments.slice(startIndex), ...assignments.slice(0, startIndex)]
    : assignments;
}

async function updateNextCleanerPointer(
  service: ServiceClient,
  property: { id: string; organization_id: string },
  cleanerAccountId: string | null
) {
  const { error } = await service
    .from("properties")
    .update({ cleaner_rotation_next_cleaner_account_id: cleanerAccountId })
    .eq("id", property.id)
    .eq("organization_id", property.organization_id);

  if (error) throw new Error(error.message);
}

async function getCleanerDisplayName(service: ServiceClient, cleanerAccountId?: string | null) {
  if (!cleanerAccountId) return null;

  const { data, error } = await service
    .from("cleaner_accounts")
    .select("display_name")
    .eq("id", cleanerAccountId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.display_name || null;
}

export async function applyCleanerTrainingRotationToJob(
  service: ServiceClient,
  jobId: string
): Promise<TrainingRotationResult> {
  const { data: job, error: jobError } = await service
    .from("turnover_jobs")
    .select("id, organization_id, property_id, scheduled_for, notes")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job?.property_id) return { offeredSlotIds: [] };

  const { data: property, error: propertyError } = await service
    .from("properties")
    .select("id, organization_id, cleaner_assignment_mode, cleaner_rotation_next_cleaner_account_id")
    .eq("id", job.property_id)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);
  if (property?.cleaner_assignment_mode !== "training_rotation") return { offeredSlotIds: [] };

  const activeAssignments = await loadActiveAssignments(service, property.id);
  if (activeAssignments.length < 2) return { offeredSlotIds: [] };

  const rotationOrder = rotateAssignments(activeAssignments, property.cleaner_rotation_next_cleaner_account_id);
  const { data: slots, error: slotsError } = await service
    .from("turnover_job_slots")
    .select("id, slot_number")
    .eq("job_id", jobId)
    .order("slot_number", { ascending: true });

  if (slotsError) throw new Error(slotsError.message);

  const slotRows = slots ?? [];
  const assignedCount = Math.min(slotRows.length, rotationOrder.length);
  if (assignedCount === 0) return { offeredSlotIds: [] };

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = getExpiresAt(getCleanerJobDate(job), now);
  const offeredSlotIds: string[] = [];

  for (let index = 0; index < assignedCount; index += 1) {
    const { data: updatedSlot, error: slotUpdateError } = await service
      .from("turnover_job_slots")
      .update({
        cleaner_account_id: rotationOrder[index].cleaner_account_id,
        status: "offered",
        offered_at: nowIso,
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
      .eq("id", slotRows[index].id)
      .select("id")
      .maybeSingle();

    if (slotUpdateError) throw new Error(slotUpdateError.message);
    if (updatedSlot?.id) offeredSlotIds.push(updatedSlot.id);
  }

  const nextAssignment = rotationOrder[assignedCount % rotationOrder.length];
  await updateNextCleanerPointer(service, property, nextAssignment?.cleaner_account_id || null);
  await refreshCleanerJobStaffing(service, jobId);

  return { offeredSlotIds };
}

export async function reofferExpiredCleanerTrainingSlot(
  service: ServiceClient,
  slotId: string,
  declinedByProfileId: string | null = null
): Promise<TrainingRotationResult> {
  const { data: slot, error: slotError } = await service
    .from("turnover_job_slots")
    .select("id, job_id, slot_number, cleaner_account_id, status, offered_at, accepted_at, declined_at")
    .eq("id", slotId)
    .maybeSingle();

  if (slotError) throw new Error(slotError.message);
  if (!slot?.job_id) return { offeredSlotIds: [] };

  const { data: job, error: jobError } = await service
    .from("turnover_jobs")
    .select("id, organization_id, property_id, scheduled_for, notes, cleaner_units_needed")
    .eq("id", slot.job_id)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job?.property_id) return { offeredSlotIds: [] };

  const { data: property, error: propertyError } = await service
    .from("properties")
    .select("id, organization_id, cleaner_assignment_mode, cleaner_rotation_next_cleaner_account_id")
    .eq("id", job.property_id)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);
  if (property?.cleaner_assignment_mode !== "training_rotation") return { offeredSlotIds: [] };

  const { data: allSlots, error: allSlotsError } = await service
    .from("turnover_job_slots")
    .select("id, status, cleaner_account_id, accepted_at, offered_at")
    .eq("job_id", job.id);

  if (allSlotsError) throw new Error(allSlotsError.message);

  const activeSlots = (allSlots ?? []).filter((row: any) =>
    ["accepted", "in_progress", "completed"].includes(String(row.status || "").toLowerCase())
  );
  const unitsNeeded = Math.max(1, Number(job.cleaner_units_needed || 1));
  if (activeSlots.length >= unitsNeeded) {
    await service
      .from("turnover_job_slots")
      .update({
        status: "declined",
        declined_at: new Date().toISOString(),
        declined_by_profile_id: declinedByProfileId,
      })
      .eq("id", slot.id);
    await refreshCleanerJobStaffing(service, job.id);
    return { offeredSlotIds: [], expiredSlotIds: [slot.id] };
  }

  const activeAssignments = await loadActiveAssignments(service, property.id);
  if (activeAssignments.length < 2) return { offeredSlotIds: [] };

  const declinedCleanerIds = new Set(
    (allSlots ?? [])
      .filter((row: any) => row.status === "declined")
      .map((row: any) => row.cleaner_account_id)
      .filter(Boolean)
  );
  if (slot.cleaner_account_id) declinedCleanerIds.add(slot.cleaner_account_id);

  const unavailableCleanerIds = new Set(
    (allSlots ?? [])
      .filter((row: any) => ["offered", "accepted", "in_progress", "completed"].includes(String(row.status || "").toLowerCase()))
      .map((row: any) => row.cleaner_account_id)
      .filter(Boolean)
  );

  const currentIndex = activeAssignments.findIndex(
    (assignment: any) => assignment.cleaner_account_id === slot.cleaner_account_id
  );
  const nextOrder =
    currentIndex >= 0
      ? [...activeAssignments.slice(currentIndex + 1), ...activeAssignments.slice(0, currentIndex + 1)]
      : rotateAssignments(activeAssignments, property.cleaner_rotation_next_cleaner_account_id);
  const nextAssignment = nextOrder.find(
    (assignment: any) =>
      !declinedCleanerIds.has(assignment.cleaner_account_id) &&
      !unavailableCleanerIds.has(assignment.cleaner_account_id)
  );

  const now = new Date();
  const nowIso = now.toISOString();
  await service
    .from("turnover_job_slots")
    .update({
      status: "declined",
      declined_at: nowIso,
      declined_by_profile_id: declinedByProfileId,
    })
    .eq("id", slot.id);

  if (!nextAssignment) {
    const { data: strandedSlot, error: insertStrandedError } = await service
      .from("turnover_job_slots")
      .insert({
        job_id: job.id,
        slot_number: slot.slot_number,
        cleaner_account_id: null,
        status: "stranded",
      })
      .select("id")
      .maybeSingle();

    if (insertStrandedError) throw new Error(insertStrandedError.message);
    await refreshCleanerJobStaffing(service, job.id);
    return { offeredSlotIds: [], expiredSlotIds: [slot.id], strandedSlotIds: strandedSlot?.id ? [strandedSlot.id] : [] };
  }

  const expiresAt = getExpiresAt(getCleanerJobDate(job), now);
  const { data: newSlot, error: insertError } = await service
    .from("turnover_job_slots")
    .insert({
      job_id: job.id,
      slot_number: slot.slot_number,
      cleaner_account_id: nextAssignment.cleaner_account_id,
      status: "offered",
      offered_at: nowIso,
      expires_at: expiresAt,
      offer_email_sent_at: null,
      offer_reminder_sent_at: null,
      day_of_reminder_sent_at: null,
      offer_push_sent_at: null,
      offer_reminder_push_sent_at: null,
      day_of_reminder_push_sent_at: null,
    })
    .select("id")
    .maybeSingle();

  if (insertError) throw new Error(insertError.message);

  if (newSlot?.id) {
    const [previousCleanerName, newCleanerName] = await Promise.all([
      getCleanerDisplayName(service, slot.cleaner_account_id),
      getCleanerDisplayName(service, nextAssignment.cleaner_account_id),
    ]);

    await writeAuditLog(service, {
      actorProfileId: null,
      actorEmail: null,
      actorRole: "system",
      organizationId: job.organization_id,
      actionType: "admin.reassign_cleaner_slot",
      targetType: "turnover_job_slot",
      targetId: newSlot.id,
      metadata: {
        reassign_source: "training_rotation_expired",
        job_id: job.id,
        slot_number: slot.slot_number,
        previous_slot_id: slot.id,
        previous_cleaner_account_id: slot.cleaner_account_id || null,
        previous_cleaner_name: previousCleanerName,
        previous_status: slot.status,
        previous_offered_at: slot.offered_at,
        previous_accepted_at: slot.accepted_at,
        previous_declined_at: slot.declined_at,
        new_cleaner_account_id: nextAssignment.cleaner_account_id,
        new_cleaner_name: newCleanerName,
      },
    });
  }

  const nextPointer = nextOrder.find(
    (assignment: any) => assignment.cleaner_account_id !== nextAssignment.cleaner_account_id
  );
  await updateNextCleanerPointer(service, property, nextPointer?.cleaner_account_id || activeAssignments[0]?.cleaner_account_id || null);
  await refreshCleanerJobStaffing(service, job.id);

  return { offeredSlotIds: newSlot?.id ? [newSlot.id] : [], expiredSlotIds: [slot.id] };
}

export async function processExpiredCleanerTrainingOffers(service: ServiceClient): Promise<TrainingRotationResult> {
  const nowIso = new Date().toISOString();
  const { data: expiredSlots, error: expiredError } = await service
    .from("turnover_job_slots")
    .select("id")
    .eq("status", "offered")
    .not("expires_at", "is", null)
    .lte("expires_at", nowIso);

  if (expiredError) throw new Error(expiredError.message);

  const offeredSlotIds: string[] = [];
  const expiredSlotIds: string[] = [];
  const strandedSlotIds: string[] = [];
  const errors: string[] = [];

  for (const slot of expiredSlots ?? []) {
    try {
      const result = await reofferExpiredCleanerTrainingSlot(service, slot.id);
      offeredSlotIds.push(...result.offeredSlotIds);
      expiredSlotIds.push(...(result.expiredSlotIds || []));
      strandedSlotIds.push(...(result.strandedSlotIds || []));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown expired training offer error.");
    }
  }

  return { offeredSlotIds, expiredSlotIds, strandedSlotIds, errors };
}
