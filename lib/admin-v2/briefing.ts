export type AdminV2PropertyRow = {
  id: string;
  name: string | null;
  address: string | null;
};

export type AdminV2TurnoverRow = {
  id: string;
  property_id: string;
  scheduled_for: string | null;
  status: string | null;
  staffing_status: string | null;
  cleaner_units_needed: number | null;
  schedule_conflict_at: string | null;
  schedule_conflict_reason: string | null;
};

export type AdminV2TurnoverSlotRow = {
  id: string;
  job_id: string;
  cleaner_account_id: string | null;
  status: string | null;
  expires_at: string | null;
};

export type AdminV2BookingRow = {
  id: string;
  property_id: string;
  checkin_date: string;
  checkout_date: string;
  guest_count: number | null;
};

export type AdminV2MaintenanceRow = {
  id: string;
  property_id: string | null;
  title?: string | null;
  category: string | null;
  urgency: string | null;
  priority?: string | null;
  severity?: string | null;
  status: string | null;
  due_at?: string | null;
  flagged_at?: string | null;
  created_at: string | null;
};

export type AdminV2InspectionRow = {
  id: string;
  property_id: string;
  title: string;
  next_due_date: string;
  active: boolean;
};

export type AdminV2PropertySignalRow = {
  property_id: string;
};

export type AdminV2PropertyCalendarRow = AdminV2PropertySignalRow & {
  is_active: boolean | null;
};

export type AdminV2TeamMemberRow = {
  profile_id: string;
  role: string;
};

export type AdminV2BriefingInput = {
  organization: { id: string; name: string };
  generatedAt: string;
  todayYmd: string;
  windowEndYmd: string;
  properties: AdminV2PropertyRow[];
  jobs: AdminV2TurnoverRow[];
  slots: AdminV2TurnoverSlotRow[];
  bookings: AdminV2BookingRow[];
  maintenance: AdminV2MaintenanceRow[];
  inspections: AdminV2InspectionRow[];
  accessRows: AdminV2PropertySignalRow[];
  calendars: AdminV2PropertyCalendarRow[];
  sops: AdminV2PropertySignalRow[];
  checklistItems: AdminV2PropertySignalRow[];
  knowledgeRows: AdminV2PropertySignalRow[];
  teamMembers: AdminV2TeamMemberRow[];
};

export type AdminV2AttentionItem = {
  id: string;
  severity: "urgent" | "attention" | "guide";
  kind: "coverage" | "conflict" | "maintenance" | "inspection" | "setup";
  title: string;
  detail: string;
  propertyName: string;
  date: string | null;
  recommendation: string;
};

export type AdminV2TimelineItem = {
  id: string;
  kind: "arrival" | "checkout" | "turnover";
  date: string;
  propertyName: string;
  title: string;
  detail: string;
  status: "ready" | "watch" | "scheduled";
};

export type AdminV2PropertyReadiness = {
  id: string;
  name: string;
  address: string;
  readinessScore: number;
  completedSignals: number;
  totalSignals: number;
  missingSignals: string[];
  nextArrivalDate: string | null;
  openIssueCount: number;
  nextTurnoverStatus: string | null;
};

export type AdminV2Briefing = {
  generatedAt: string;
  organization: { id: string; name: string };
  window: { start: string; end: string };
  summary: {
    tone: "calm" | "watch" | "urgent";
    headline: string;
    detail: string;
  };
  metrics: {
    propertyCount: number;
    portfolioReadiness: number;
    arrivalsToday: number;
    departuresToday: number;
    turnoversToday: number;
    coveredTurnoversToday: number;
    openMaintenance: number;
    overdueInspections: number;
    teamMembers: number;
  };
  attention: AdminV2AttentionItem[];
  timeline: AdminV2TimelineItem[];
  properties: AdminV2PropertyReadiness[];
  guardrails: {
    mode: "read-only";
    externalActionsEnabled: false;
    generatedFromLiveRecords: true;
  };
};

const CLOSED_JOB_STATUSES = new Set(["completed", "cancelled", "canceled"]);
const COVERED_SLOT_STATUSES = new Set(["accepted", "in_progress", "completed"]);
const CLOSED_MAINTENANCE_STATUSES = new Set(["resolved", "closed", "completed", "cancelled", "canceled"]);

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function propertyName(propertyId: string | null, names: Map<string, string>) {
  if (!propertyId) return "Portfolio";
  return names.get(propertyId) || `Property ${propertyId.slice(0, 8)}`;
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function isHighPriority(row: AdminV2MaintenanceRow) {
  return [row.urgency, row.priority, row.severity]
    .map(normalize)
    .some((value) => ["urgent", "critical", "high", "emergency"].includes(value));
}

function turnoverCoverage(job: AdminV2TurnoverRow, slots: AdminV2TurnoverSlotRow[]) {
  const unitsNeeded = Math.max(1, Number(job.cleaner_units_needed || 1));
  const covered = slots.filter((slot) => COVERED_SLOT_STATUSES.has(normalize(slot.status))).length;
  return { covered, unitsNeeded, isCovered: covered >= unitsNeeded };
}

function compareAttention(a: AdminV2AttentionItem, b: AdminV2AttentionItem) {
  const severity = { urgent: 0, attention: 1, guide: 2 };
  return severity[a.severity] - severity[b.severity]
    || String(a.date || "9999-12-31").localeCompare(String(b.date || "9999-12-31"))
    || a.title.localeCompare(b.title);
}

export function buildAdminV2Briefing(input: AdminV2BriefingInput): AdminV2Briefing {
  const names = new Map(
    input.properties.map((property) => [
      property.id,
      property.name?.trim() || property.address?.trim() || `Property ${property.id.slice(0, 8)}`,
    ]),
  );
  const slotsByJob = new Map<string, AdminV2TurnoverSlotRow[]>();
  for (const slot of input.slots) {
    const rows = slotsByJob.get(slot.job_id) || [];
    rows.push(slot);
    slotsByJob.set(slot.job_id, rows);
  }

  const openMaintenance = input.maintenance.filter(
    (item) => !CLOSED_MAINTENANCE_STATUSES.has(normalize(item.status)),
  );
  const activeJobs = input.jobs.filter((job) => !CLOSED_JOB_STATUSES.has(normalize(job.status)));
  const overdueInspections = input.inspections.filter(
    (inspection) => inspection.active && inspection.next_due_date < input.todayYmd,
  );
  const accessIds = new Set(input.accessRows.map((row) => row.property_id));
  const calendarIds = new Set(
    input.calendars.filter((row) => row.is_active !== false).map((row) => row.property_id),
  );
  const sopIds = new Set(input.sops.map((row) => row.property_id));
  const checklistIds = new Set(input.checklistItems.map((row) => row.property_id));
  const knowledgeIds = new Set(input.knowledgeRows.map((row) => row.property_id));
  const teamReady = input.teamMembers.some((member) => ["cleaner", "grounds"].includes(normalize(member.role)));

  const properties = input.properties.map<AdminV2PropertyReadiness>((property) => {
    const signals = [
      { ready: Boolean(property.address?.trim()), label: "property address" },
      { ready: accessIds.has(property.id), label: "access instructions" },
      { ready: calendarIds.has(property.id), label: "booking calendar" },
      { ready: sopIds.has(property.id) || knowledgeIds.has(property.id), label: "operating guide" },
      { ready: checklistIds.has(property.id), label: "turnover checklist" },
      { ready: teamReady, label: "operating team" },
    ];
    const completedSignals = signals.filter((signal) => signal.ready).length;
    const propertyBookings = input.bookings
      .filter((booking) => booking.property_id === property.id && booking.checkin_date >= input.todayYmd)
      .sort((a, b) => a.checkin_date.localeCompare(b.checkin_date));
    const propertyJobs = activeJobs
      .filter((job) => job.property_id === property.id && job.scheduled_for)
      .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)));

    return {
      id: property.id,
      name: names.get(property.id) || "Property",
      address: property.address?.trim() || "Address not added",
      readinessScore: Math.round((completedSignals / signals.length) * 100),
      completedSignals,
      totalSignals: signals.length,
      missingSignals: signals.filter((signal) => !signal.ready).map((signal) => signal.label),
      nextArrivalDate: propertyBookings[0]?.checkin_date || null,
      openIssueCount: openMaintenance.filter((item) => item.property_id === property.id).length,
      nextTurnoverStatus: propertyJobs[0]?.staffing_status || propertyJobs[0]?.status || null,
    };
  }).sort((a, b) => a.readinessScore - b.readinessScore || a.name.localeCompare(b.name));

  const attention: AdminV2AttentionItem[] = [];
  for (const job of activeJobs) {
    if (!job.scheduled_for) continue;
    const coverage = turnoverCoverage(job, slotsByJob.get(job.id) || []);
    const property = propertyName(job.property_id, names);
    const staffingStatus = normalize(job.staffing_status);

    if (!coverage.isCovered && !["staffed", "covered"].includes(staffingStatus)) {
      attention.push({
        id: `coverage-${job.id}`,
        severity: job.scheduled_for <= input.todayYmd ? "urgent" : "attention",
        kind: "coverage",
        title: `${property} needs turnover coverage`,
        detail: `${coverage.covered} of ${coverage.unitsNeeded} required cleaner position${coverage.unitsNeeded === 1 ? "" : "s"} confirmed.`,
        propertyName: property,
        date: job.scheduled_for,
        recommendation: "Review the existing staffing plan in Classic Gulera before the turnover window begins.",
      });
    }

    if (job.schedule_conflict_at || normalize(job.staffing_status).includes("conflict")) {
      attention.push({
        id: `conflict-${job.id}`,
        severity: "urgent",
        kind: "conflict",
        title: `${property} has a scheduling conflict`,
        detail: job.schedule_conflict_reason?.trim() || "The existing turnover record is marked with a schedule conflict.",
        propertyName: property,
        date: job.scheduled_for,
        recommendation: "Compare the booking and turnover timing in Classic Gulera before approving any staffing change.",
      });
    }
  }

  for (const item of openMaintenance) {
    const property = propertyName(item.property_id, names);
    attention.push({
      id: `maintenance-${item.id}`,
      severity: isHighPriority(item) ? "urgent" : "attention",
      kind: "maintenance",
      title: item.title?.trim() || `${property} maintenance needs review`,
      detail: item.category?.trim()
        ? `${property} · ${item.category.trim()}`
        : `${property} has an unresolved maintenance record.`,
      propertyName: property,
      date: dateOnly(item.due_at) || dateOnly(item.flagged_at) || dateOnly(item.created_at),
      recommendation: "Review the existing maintenance record and decide the next step in Classic Gulera.",
    });
  }

  for (const inspection of overdueInspections) {
    const property = propertyName(inspection.property_id, names);
    attention.push({
      id: `inspection-${inspection.id}`,
      severity: "attention",
      kind: "inspection",
      title: `${inspection.title} is overdue`,
      detail: `${property} was due for inspection on ${inspection.next_due_date}.`,
      propertyName: property,
      date: inspection.next_due_date,
      recommendation: "Review the inspection rule and schedule the work in Classic Gulera.",
    });
  }

  for (const property of properties.filter((item) => item.readinessScore < 50).slice(0, 3)) {
    attention.push({
      id: `setup-${property.id}`,
      severity: "guide",
      kind: "setup",
      title: `Complete the foundation for ${property.name}`,
      detail: `Still missing: ${property.missingSignals.slice(0, 3).join(", ")}.`,
      propertyName: property.name,
      date: null,
      recommendation: "Finish the missing property setup in Classic Gulera before relying on automated readiness.",
    });
  }

  attention.sort(compareAttention);

  const timeline: AdminV2TimelineItem[] = [];
  for (const booking of input.bookings) {
    const property = propertyName(booking.property_id, names);
    if (booking.checkout_date >= input.todayYmd && booking.checkout_date <= input.windowEndYmd) {
      timeline.push({
        id: `checkout-${booking.id}`,
        kind: "checkout",
        date: booking.checkout_date,
        propertyName: property,
        title: "Guest checkout",
        detail: booking.guest_count ? `${booking.guest_count} registered guests` : "Departure on the connected calendar",
        status: "scheduled",
      });
    }
    if (booking.checkin_date >= input.todayYmd && booking.checkin_date <= input.windowEndYmd) {
      timeline.push({
        id: `arrival-${booking.id}`,
        kind: "arrival",
        date: booking.checkin_date,
        propertyName: property,
        title: "Guest arrival",
        detail: booking.guest_count ? `${booking.guest_count} registered guests` : "Arrival on the connected calendar",
        status: "scheduled",
      });
    }
  }
  for (const job of activeJobs) {
    if (!job.scheduled_for || job.scheduled_for < input.todayYmd || job.scheduled_for > input.windowEndYmd) continue;
    const coverage = turnoverCoverage(job, slotsByJob.get(job.id) || []);
    timeline.push({
      id: `turnover-${job.id}`,
      kind: "turnover",
      date: job.scheduled_for,
      propertyName: propertyName(job.property_id, names),
      title: "Turnover",
      detail: coverage.isCovered
        ? `Coverage confirmed for ${coverage.covered} of ${coverage.unitsNeeded} cleaner position${coverage.unitsNeeded === 1 ? "" : "s"}`
        : `Waiting on ${coverage.unitsNeeded - coverage.covered} of ${coverage.unitsNeeded} cleaner position${coverage.unitsNeeded === 1 ? "" : "s"}`,
      status: coverage.isCovered ? "ready" : "watch",
    });
  }
  const kindOrder = { checkout: 0, turnover: 1, arrival: 2 };
  timeline.sort((a, b) => a.date.localeCompare(b.date) || kindOrder[a.kind] - kindOrder[b.kind]);

  const todayJobs = activeJobs.filter((job) => job.scheduled_for === input.todayYmd);
  const coveredToday = todayJobs.filter((job) => turnoverCoverage(job, slotsByJob.get(job.id) || []).isCovered).length;
  const portfolioReadiness = properties.length
    ? Math.round(properties.reduce((total, property) => total + property.readinessScore, 0) / properties.length)
    : 0;
  const urgentCount = attention.filter((item) => item.severity === "urgent").length;
  const tone = urgentCount > 0 ? "urgent" : attention.length > 0 ? "watch" : "calm";
  const headline = urgentCount > 0
    ? `${urgentCount} urgent item${urgentCount === 1 ? " needs" : "s need"} your review.`
    : attention.length > 0
      ? `${attention.length} item${attention.length === 1 ? " is" : "s are"} worth reviewing.`
      : "Today’s operation looks calm.";

  return {
    generatedAt: input.generatedAt,
    organization: input.organization,
    window: { start: input.todayYmd, end: input.windowEndYmd },
    summary: {
      tone,
      headline,
      detail: "Gulera analyzed current operating records and prepared recommendations only. No messages, assignments, charges, or records were changed.",
    },
    metrics: {
      propertyCount: input.properties.length,
      portfolioReadiness,
      arrivalsToday: input.bookings.filter((booking) => booking.checkin_date === input.todayYmd).length,
      departuresToday: input.bookings.filter((booking) => booking.checkout_date === input.todayYmd).length,
      turnoversToday: todayJobs.length,
      coveredTurnoversToday: coveredToday,
      openMaintenance: openMaintenance.length,
      overdueInspections: overdueInspections.length,
      teamMembers: new Set(input.teamMembers.map((member) => member.profile_id)).size,
    },
    attention: attention.slice(0, 12),
    timeline: timeline.slice(0, 18),
    properties,
    guardrails: {
      mode: "read-only",
      externalActionsEnabled: false,
      generatedFromLiveRecords: true,
    },
  };
}
