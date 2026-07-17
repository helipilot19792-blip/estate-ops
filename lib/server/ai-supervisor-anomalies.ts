export type SupervisorStaffingJob = {
  id: string;
  property_id: string;
  scheduled_for: string | null;
  cleaner_units_needed: number | null;
  status: string | null;
  staffing_status: string | null;
};

export type SupervisorStaffingSlot = {
  id: string;
  job_id: string;
  cleaner_account_id: string | null;
  status: string | null;
  offered_at: string | null;
  declined_at: string | null;
  expires_at: string | null;
  created_at: string | null;
};

export type SupervisorCleanerAssignment = {
  property_id: string;
  cleaner_account_id: string;
  priority: number | null;
};

export type SupervisorStatusEvent = {
  job_id: string;
  account_id: string | null;
  event_type: string;
  created_at: string | null;
  push_sent_count?: number | null;
  push_errors?: unknown;
};

export type SupervisorStaffingAnomaly = {
  id: string;
  code:
    | "rotation_moved_backward"
    | "repeat_recipient"
    | "decline_without_admin_event"
    | "decline_notification_failed"
    | "stranded_without_admin_event"
    | "stranded_notification_failed"
    | "multiple_active_assignments"
    | "expired_offer"
    | "offered_without_cleaner";
  priority: "high" | "medium";
  confidence: "high" | "medium";
  jobId: string;
  propertyId: string;
  title: string;
  reason: string;
  evidence: string[];
  recommendation: string;
};

type AnalyzeStaffingInput = {
  jobs: SupervisorStaffingJob[];
  slots: SupervisorStaffingSlot[];
  assignments: SupervisorCleanerAssignment[];
  statusEvents: SupervisorStatusEvent[];
  cleanerNames: Map<string, string>;
  propertyNames: Map<string, string>;
  now?: Date;
};

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").toLowerCase().trim();
}

function formatCleaner(cleanerId: string | null, names: Map<string, string>) {
  if (!cleanerId) return "No cleaner";
  return names.get(cleanerId) || `Cleaner ${cleanerId.slice(0, 8)}`;
}

function formatProperty(propertyId: string, names: Map<string, string>) {
  return names.get(propertyId) || `Property ${propertyId.slice(0, 8)}`;
}

function sortOfferAttempts(slots: SupervisorStaffingSlot[]) {
  return [...slots]
    .filter((slot) => slot.offered_at)
    .sort((a, b) => new Date(a.offered_at || 0).getTime() - new Date(b.offered_at || 0).getTime());
}

export function analyzeStaffingAnomalies({
  jobs,
  slots,
  assignments,
  statusEvents,
  cleanerNames,
  propertyNames,
  now = new Date(),
}: AnalyzeStaffingInput): SupervisorStaffingAnomaly[] {
  const anomalies: SupervisorStaffingAnomaly[] = [];
  const slotsByJob = new Map<string, SupervisorStaffingSlot[]>();
  const eventsByJob = new Map<string, SupervisorStatusEvent[]>();
  const prioritiesByProperty = new Map<string, Map<string, number>>();

  for (const slot of slots) {
    const rows = slotsByJob.get(slot.job_id) || [];
    rows.push(slot);
    slotsByJob.set(slot.job_id, rows);
  }

  for (const event of statusEvents) {
    const rows = eventsByJob.get(event.job_id) || [];
    rows.push(event);
    eventsByJob.set(event.job_id, rows);
  }

  for (const assignment of assignments) {
    const priorities = prioritiesByProperty.get(assignment.property_id) || new Map<string, number>();
    priorities.set(assignment.cleaner_account_id, Number(assignment.priority || Number.MAX_SAFE_INTEGER));
    prioritiesByProperty.set(assignment.property_id, priorities);
  }

  for (const job of jobs) {
    const jobSlots = slotsByJob.get(job.id) || [];
    const jobEvents = eventsByJob.get(job.id) || [];
    const propertyName = formatProperty(job.property_id, propertyNames);
    const attempts = sortOfferAttempts(jobSlots);
    const priorityByCleaner = prioritiesByProperty.get(job.property_id) || new Map<string, number>();
    const unitsNeeded = Math.max(1, Number(job.cleaner_units_needed || 1));

    for (let index = 1; unitsNeeded === 1 && index < attempts.length; index += 1) {
      const previous = attempts[index - 1];
      const current = attempts[index];
      if (!previous.cleaner_account_id || !current.cleaner_account_id) continue;
      const previousPriority = priorityByCleaner.get(previous.cleaner_account_id);
      const currentPriority = priorityByCleaner.get(current.cleaner_account_id);
      if (previousPriority === undefined || currentPriority === undefined || currentPriority > previousPriority) continue;

      anomalies.push({
        id: `staffing-backward-${job.id}-${current.id}`,
        code: "rotation_moved_backward",
        priority: "high",
        confidence: "high",
        jobId: job.id,
        propertyId: job.property_id,
        title: `Rotation moved backward for ${propertyName}`,
        reason: `${formatCleaner(current.cleaner_account_id, cleanerNames)} was offered the job after ${formatCleaner(previous.cleaner_account_id, cleanerNames)}, even though the new recipient is earlier or equal in the property rotation.`,
        evidence: [
          `${formatCleaner(previous.cleaner_account_id, cleanerNames)} was priority ${previousPriority} and received an offer at ${previous.offered_at}.`,
          `${formatCleaner(current.cleaner_account_id, cleanerNames)} was priority ${currentPriority} and received the later offer at ${current.offered_at}.`,
        ],
        recommendation: "Review the offer chain, prevent any further backward reoffer, and mark the job stranded if no later eligible cleaner remains.",
      });
      break;
    }

    const attemptsByCleaner = new Map<string, SupervisorStaffingSlot[]>();
    for (const attempt of attempts) {
      if (!attempt.cleaner_account_id) continue;
      const rows = attemptsByCleaner.get(attempt.cleaner_account_id) || [];
      rows.push(attempt);
      attemptsByCleaner.set(attempt.cleaner_account_id, rows);
    }
    for (const [cleanerId, cleanerAttempts] of attemptsByCleaner) {
      if (unitsNeeded !== 1 || cleanerAttempts.length < 2) continue;
      anomalies.push({
        id: `staffing-repeat-${job.id}-${cleanerId}`,
        code: "repeat_recipient",
        priority: "high",
        confidence: "high",
        jobId: job.id,
        propertyId: job.property_id,
        title: `Repeated cleaner offer for ${propertyName}`,
        reason: `${formatCleaner(cleanerId, cleanerNames)} appears ${cleanerAttempts.length} times in the same job offer chain.`,
        evidence: cleanerAttempts.slice(-3).map((attempt) => `Offer recorded at ${attempt.offered_at} with status ${normalizeStatus(attempt.status) || "unknown"}.`),
        recommendation: "Stop the repeated offer, verify the cleaner's earlier response, and continue only to a later eligible cleaner.",
      });
    }

    for (const declinedSlot of jobSlots.filter((slot) => normalizeStatus(slot.status) === "declined")) {
      const matchingAdminEvents = jobEvents.filter(
        (event) => event.event_type === "declined" && (!declinedSlot.cleaner_account_id || event.account_id === declinedSlot.cleaner_account_id)
      );
      if (matchingAdminEvents.length === 0) {
        anomalies.push({
          id: `staffing-unreported-decline-${job.id}-${declinedSlot.id}`,
          code: "decline_without_admin_event",
          priority: "medium",
          confidence: "high",
          jobId: job.id,
          propertyId: job.property_id,
          title: `Cleaner decline was not reported for ${propertyName}`,
          reason: `${formatCleaner(declinedSlot.cleaner_account_id, cleanerNames)} declined, but no matching admin decline event exists.`,
          evidence: [`Slot ${declinedSlot.id.slice(0, 8)} was declined at ${declinedSlot.declined_at || "an unknown time"}.`, "No matching declined event was found in the admin status history."],
          recommendation: "Confirm the admin team saw the decline, inspect the next assignment, and verify notification delivery.",
        });
      } else if (!matchingAdminEvents.some((event) => Number(event.push_sent_count || 0) > 0)) {
        anomalies.push({
          id: `staffing-undelivered-decline-${job.id}-${declinedSlot.id}`,
          code: "decline_notification_failed",
          priority: "medium",
          confidence: "high",
          jobId: job.id,
          propertyId: job.property_id,
          title: `Cleaner decline notification was not delivered for ${propertyName}`,
          reason: `${formatCleaner(declinedSlot.cleaner_account_id, cleanerNames)} declined and the admin event was recorded, but it reached zero admin devices.`,
          evidence: [`Slot ${declinedSlot.id.slice(0, 8)} was declined at ${declinedSlot.declined_at || "an unknown time"}.`, `${matchingAdminEvents.length} matching event${matchingAdminEvents.length === 1 ? " was" : "s were"} recorded with no successful push delivery.`],
          recommendation: "Review the job in-app now and check admin push subscriptions or delivery errors before relying on the next alert.",
        });
      }
    }

    const strandedSlots = jobSlots.filter((slot) => normalizeStatus(slot.status) === "stranded");
    const strandedEvents = jobEvents.filter((event) => event.event_type === "stranded");
    if (strandedSlots.length > 0 && strandedEvents.length === 0) {
      anomalies.push({
        id: `staffing-unreported-stranded-${job.id}`,
        code: "stranded_without_admin_event",
        priority: "high",
        confidence: "high",
        jobId: job.id,
        propertyId: job.property_id,
        title: `Stranded job was not escalated for ${propertyName}`,
        reason: "The job has no eligible cleaner, but no matching stranded notification event exists for the admin team.",
        evidence: [`${strandedSlots.length} stranded slot${strandedSlots.length === 1 ? " is" : "s are"} recorded.`, "No stranded event was found in the admin status history."],
        recommendation: "Escalate this job immediately and choose a manual assignment, external backup, reschedule, or cancellation path.",
      });
    } else if (strandedSlots.length > 0 && !strandedEvents.some((event) => Number(event.push_sent_count || 0) > 0)) {
      anomalies.push({
        id: `staffing-undelivered-stranded-${job.id}`,
        code: "stranded_notification_failed",
        priority: "high",
        confidence: "high",
        jobId: job.id,
        propertyId: job.property_id,
        title: `Stranded job alert was not delivered for ${propertyName}`,
        reason: "The job has no eligible cleaner and its escalation reached zero admin devices.",
        evidence: [`${strandedSlots.length} stranded slot${strandedSlots.length === 1 ? " is" : "s are"} recorded.`, `${strandedEvents.length} stranded event${strandedEvents.length === 1 ? " was" : "s were"} recorded with no successful push delivery.`],
        recommendation: "Handle the stranded job immediately and repair admin notification delivery before the next staffing escalation.",
      });
    }

    const activeSlots = jobSlots.filter((slot) => ["offered", "accepted", "in_progress"].includes(normalizeStatus(slot.status)));
    if (activeSlots.length > unitsNeeded) {
      anomalies.push({
        id: `staffing-too-many-active-${job.id}`,
        code: "multiple_active_assignments",
        priority: "high",
        confidence: "high",
        jobId: job.id,
        propertyId: job.property_id,
        title: `Too many active cleaner assignments for ${propertyName}`,
        reason: `${activeSlots.length} slots are active even though the job requires ${unitsNeeded}.`,
        evidence: activeSlots.slice(0, 4).map((slot) => `${formatCleaner(slot.cleaner_account_id, cleanerNames)} is ${normalizeStatus(slot.status)}.`),
        recommendation: "Review duplicate active slots before another cleaner accepts or arrives unnecessarily.",
      });
    }

    for (const offeredSlot of jobSlots.filter((slot) => normalizeStatus(slot.status) === "offered")) {
      if (!offeredSlot.cleaner_account_id) {
        anomalies.push({
          id: `staffing-offered-without-cleaner-${job.id}-${offeredSlot.id}`,
          code: "offered_without_cleaner",
          priority: "high",
          confidence: "high",
          jobId: job.id,
          propertyId: job.property_id,
          title: `Offer has no cleaner for ${propertyName}`,
          reason: "A slot is marked offered without an assigned cleaner account.",
          evidence: [`Slot ${offeredSlot.id.slice(0, 8)} has status offered and a blank cleaner.`],
          recommendation: "Correct the slot assignment or mark it stranded so the job cannot appear safely staffed.",
        });
      }

      const expiresAtMs = new Date(offeredSlot.expires_at || 0).getTime();
      if (offeredSlot.expires_at && Number.isFinite(expiresAtMs) && expiresAtMs < now.getTime()) {
        anomalies.push({
          id: `staffing-expired-offer-${job.id}-${offeredSlot.id}`,
          code: "expired_offer",
          priority: "high",
          confidence: "high",
          jobId: job.id,
          propertyId: job.property_id,
          title: `Expired cleaner offer is still active for ${propertyName}`,
          reason: `${formatCleaner(offeredSlot.cleaner_account_id, cleanerNames)} still has an offered slot after its response deadline.`,
          evidence: [`Offer expired at ${offeredSlot.expires_at} but remains in offered status.`],
          recommendation: "Advance the rotation or mark the job stranded, then verify the overdue notification was delivered.",
        });
      }
    }
  }

  const priorityRank = { high: 0, medium: 1 };
  return anomalies.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title));
}
