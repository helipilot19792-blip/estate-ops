export type RescueJob = {
  id: string;
  property_id: string;
  scheduled_for: string | null;
  cleaner_units_needed: number | null;
  status: string | null;
};

export type RescueSlot = {
  id: string;
  job_id: string;
  cleaner_account_id: string | null;
  status: string | null;
  offered_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  expires_at: string | null;
};

export type RescueAssignment = {
  property_id: string;
  cleaner_account_id: string;
  priority: number | null;
};

export type RescueCleaner = {
  id: string;
  display_name: string | null;
  active: boolean | null;
};

export type RescueCleanerMember = {
  cleaner_account_id: string;
  profile_id: string;
};

export type RescueHistorySlot = {
  cleaner_account_id: string | null;
  status: string | null;
};

export type TurnoverRescueCandidate = {
  cleanerAccountId: string;
  targetProfileId: string;
  cleanerName: string;
  assignmentPriority: number;
  score: number;
  reliabilityPercent: number | null;
  completedOrAcceptedJobs: number;
  reasons: string[];
};

export type TurnoverRescuePlan = {
  jobId: string;
  slotId: string;
  propertyId: string;
  propertyName: string;
  scheduledFor: string;
  urgency: "high" | "medium";
  candidates: TurnoverRescueCandidate[];
  excludedConflictCount: number;
  declinedCandidateCount: number;
};

export type TurnoverCoverageSummary = {
  waiting: number;
  resolved: number;
};

type BuildRescuePlansInput = {
  jobs: RescueJob[];
  slots: RescueSlot[];
  assignments: RescueAssignment[];
  cleaners: RescueCleaner[];
  members: RescueCleanerMember[];
  historySlots: RescueHistorySlot[];
  propertyNames: Map<string, string>;
  profileNames?: Map<string, string>;
  todayYmd: string;
  tomorrowYmd: string;
  now?: Date;
};

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function isAcceptedStatus(value: string | null | undefined) {
  return ["accepted", "in_progress", "completed"].includes(normalizeStatus(value));
}

function isOfferWaiting(slot: RescueSlot, nowMs: number) {
  if (normalizeStatus(slot.status) !== "offered" || !slot.cleaner_account_id) return false;
  if (!slot.expires_at) return true;
  const expiresAtMs = new Date(slot.expires_at).getTime();
  return !Number.isFinite(expiresAtMs) || expiresAtMs > nowMs;
}

function getReliability(rows: RescueHistorySlot[]) {
  const accepted = rows.filter((row) => isAcceptedStatus(row.status)).length;
  const declined = rows.filter((row) => normalizeStatus(row.status) === "declined").length;
  const decisions = accepted + declined;
  return {
    accepted,
    percent: decisions >= 2 ? Math.round((accepted / decisions) * 100) : null,
  };
}

export function buildTurnoverRescuePlans({
  jobs,
  slots,
  assignments,
  cleaners,
  members,
  historySlots,
  propertyNames,
  profileNames = new Map(),
  todayYmd,
  tomorrowYmd,
  now = new Date(),
}: BuildRescuePlansInput): { plans: TurnoverRescuePlan[]; coverage: TurnoverCoverageSummary } {
  const nowMs = now.getTime();
  const slotsByJob = new Map<string, RescueSlot[]>();
  const assignmentsByProperty = new Map<string, RescueAssignment[]>();
  const memberByCleaner = new Map<string, RescueCleanerMember>();
  const historyByCleaner = new Map<string, RescueHistorySlot[]>();
  const cleanerById = new Map(cleaners.map((cleaner) => [cleaner.id, cleaner]));

  for (const slot of slots) {
    const rows = slotsByJob.get(slot.job_id) || [];
    rows.push(slot);
    slotsByJob.set(slot.job_id, rows);
  }
  for (const assignment of assignments) {
    const rows = assignmentsByProperty.get(assignment.property_id) || [];
    rows.push(assignment);
    assignmentsByProperty.set(assignment.property_id, rows);
  }
  for (const member of members) {
    if (!memberByCleaner.has(member.cleaner_account_id)) memberByCleaner.set(member.cleaner_account_id, member);
  }
  for (const slot of historySlots) {
    if (!slot.cleaner_account_id) continue;
    const rows = historyByCleaner.get(slot.cleaner_account_id) || [];
    rows.push(slot);
    historyByCleaner.set(slot.cleaner_account_id, rows);
  }

  const commitments = new Set<string>();
  for (const job of jobs) {
    if (!job.scheduled_for) continue;
    for (const slot of slotsByJob.get(job.id) || []) {
      if (slot.cleaner_account_id && isAcceptedStatus(slot.status)) {
        commitments.add(`${slot.cleaner_account_id}:${job.scheduled_for}`);
      }
    }
  }

  const plans: TurnoverRescuePlan[] = [];
  let waiting = 0;
  let resolved = 0;

  for (const job of jobs) {
    if (!job.scheduled_for || ![todayYmd, tomorrowYmd].includes(job.scheduled_for)) continue;
    if (["completed", "cancelled", "canceled"].includes(normalizeStatus(job.status))) continue;

    const jobSlots = slotsByJob.get(job.id) || [];
    const unitsNeeded = Math.max(1, Number(job.cleaner_units_needed || 1));
    const acceptedCount = jobSlots.filter((slot) => isAcceptedStatus(slot.status)).length;
    if (acceptedCount >= unitsNeeded) {
      resolved += 1;
      continue;
    }
    if (jobSlots.some((slot) => isOfferWaiting(slot, nowMs))) {
      waiting += 1;
      continue;
    }

    const rescueSlot = jobSlots.filter((slot) => !isAcceptedStatus(slot.status)).sort((a, b) => {
      const rank = (slot: RescueSlot) => {
        const status = normalizeStatus(slot.status);
        if (status === "stranded" || !slot.cleaner_account_id) return 0;
        if (status === "declined") return 1;
        if (status === "offered") return 2;
        return 3;
      };
      return rank(a) - rank(b);
    })[0];
    if (!rescueSlot) continue;

    const declinedCleanerIds = new Set(
      jobSlots
        .filter((slot) => normalizeStatus(slot.status) === "declined")
        .map((slot) => slot.cleaner_account_id)
        .filter((value): value is string => Boolean(value))
    );
    const currentCleanerIds = new Set(
      jobSlots
        .filter((slot) => ["offered", "accepted", "in_progress"].includes(normalizeStatus(slot.status)))
        .map((slot) => slot.cleaner_account_id)
        .filter((value): value is string => Boolean(value))
    );
    let excludedConflictCount = 0;

    const candidates = (assignmentsByProperty.get(job.property_id) || [])
      .flatMap((assignment) => {
        const cleaner = cleanerById.get(assignment.cleaner_account_id);
        const member = memberByCleaner.get(assignment.cleaner_account_id);
        if (!cleaner || cleaner.active === false || !member) return [];
        if (declinedCleanerIds.has(cleaner.id) || currentCleanerIds.has(cleaner.id)) return [];
        if (commitments.has(`${cleaner.id}:${job.scheduled_for}`)) {
          excludedConflictCount += 1;
          return [];
        }

        const priority = Math.max(1, Number(assignment.priority || Number.MAX_SAFE_INTEGER));
        const reliability = getReliability(historyByCleaner.get(cleaner.id) || []);
        const priorityScore = Math.max(0, 55 - (priority - 1) * 9);
        const reliabilityScore = reliability.percent === null ? 12 : Math.round(reliability.percent * 0.3);
        const experienceScore = Math.min(10, reliability.accepted * 2);
        const cleanerName = cleaner.display_name || profileNames.get(member.profile_id) || `Cleaner ${cleaner.id.slice(0, 8)}`;
        const reasons = [`Property assignment priority ${priority}`];
        if (reliability.percent !== null) reasons.push(`${reliability.percent}% acceptance history`);
        else reasons.push("Limited response history; ranked mainly by property priority");
        reasons.push("No accepted job conflict on this date");

        return [{
          cleanerAccountId: cleaner.id,
          targetProfileId: member.profile_id,
          cleanerName,
          assignmentPriority: priority,
          score: priorityScore + reliabilityScore + experienceScore,
          reliabilityPercent: reliability.percent,
          completedOrAcceptedJobs: reliability.accepted,
          reasons,
        } satisfies TurnoverRescueCandidate];
      })
      .sort((a, b) => b.score - a.score || a.assignmentPriority - b.assignmentPriority || a.cleanerName.localeCompare(b.cleanerName))
      .slice(0, 3);

    plans.push({
      jobId: job.id,
      slotId: rescueSlot.id,
      propertyId: job.property_id,
      propertyName: propertyNames.get(job.property_id) || `Property ${job.property_id.slice(0, 8)}`,
      scheduledFor: job.scheduled_for,
      urgency: job.scheduled_for === todayYmd ? "high" : "medium",
      candidates,
      excludedConflictCount,
      declinedCandidateCount: declinedCleanerIds.size,
    });
  }

  return {
    plans: plans.sort((a, b) => (a.urgency === b.urgency ? a.scheduledFor.localeCompare(b.scheduledFor) : a.urgency === "high" ? -1 : 1)),
    coverage: { waiting, resolved },
  };
}
