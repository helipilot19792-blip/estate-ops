import assert from "node:assert/strict";
import { analyzeStaffingAnomalies } from "../lib/server/ai-supervisor-anomalies.ts";

const propertyId = "property-1";
const jobId = "job-1";
const jackieId = "cleaner-jackie";
const dawnId = "cleaner-dawn";
const baseJob = {
  id: jobId,
  property_id: propertyId,
  scheduled_for: "2026-08-23",
  cleaner_units_needed: 1,
  status: "offered",
  staffing_status: "unfilled",
};
const assignments = [
  { property_id: propertyId, cleaner_account_id: jackieId, priority: 1 },
  { property_id: propertyId, cleaner_account_id: dawnId, priority: 2 },
];
const cleanerNames = new Map([
  [jackieId, "Jackie"],
  [dawnId, "Dawn"],
]);
const propertyNames = new Map([[propertyId, "Cottage Near the Beach"]]);

function slot(overrides) {
  return {
    id: overrides.id,
    job_id: jobId,
    cleaner_account_id: overrides.cleaner_account_id ?? null,
    status: overrides.status,
    offered_at: overrides.offered_at ?? null,
    declined_at: overrides.declined_at ?? null,
    expires_at: overrides.expires_at ?? null,
    created_at: overrides.created_at ?? overrides.offered_at ?? null,
  };
}

const loopFindings = analyzeStaffingAnomalies({
  jobs: [baseJob],
  assignments,
  cleanerNames,
  propertyNames,
  now: new Date("2026-07-17T18:00:00Z"),
  statusEvents: [
    { job_id: jobId, account_id: jackieId, event_type: "declined", created_at: "2026-07-17T15:00:01Z", push_sent_count: 1 },
    { job_id: jobId, account_id: dawnId, event_type: "declined", created_at: "2026-07-17T16:00:01Z", push_sent_count: 1 },
  ],
  slots: [
    slot({ id: "slot-1", cleaner_account_id: jackieId, status: "declined", offered_at: "2026-07-17T14:00:00Z", declined_at: "2026-07-17T15:00:00Z" }),
    slot({ id: "slot-2", cleaner_account_id: dawnId, status: "declined", offered_at: "2026-07-17T15:00:02Z", declined_at: "2026-07-17T16:00:00Z" }),
    slot({ id: "slot-3", cleaner_account_id: jackieId, status: "offered", offered_at: "2026-07-17T16:00:02Z", expires_at: "2026-07-19T16:00:02Z" }),
  ],
});
const loopCodes = new Set(loopFindings.map((finding) => finding.code));
assert(loopCodes.has("rotation_moved_backward"), "backward rotation should be detected");
assert(loopCodes.has("repeat_recipient"), "repeated recipient should be detected");

const healthyFindings = analyzeStaffingAnomalies({
  jobs: [baseJob],
  assignments,
  cleanerNames,
  propertyNames,
  now: new Date("2026-07-17T18:00:00Z"),
  statusEvents: [
    { job_id: jobId, account_id: jackieId, event_type: "declined", created_at: "2026-07-17T15:00:01Z", push_sent_count: 1 },
  ],
  slots: [
    slot({ id: "slot-1", cleaner_account_id: jackieId, status: "declined", offered_at: "2026-07-17T14:00:00Z", declined_at: "2026-07-17T15:00:00Z" }),
    slot({ id: "slot-2", cleaner_account_id: dawnId, status: "offered", offered_at: "2026-07-17T15:00:02Z", expires_at: "2026-07-19T15:00:02Z" }),
  ],
});
assert.equal(healthyFindings.length, 0, "a healthy forward rotation should not be flagged");

const missingEscalationFindings = analyzeStaffingAnomalies({
  jobs: [baseJob],
  assignments,
  cleanerNames,
  propertyNames,
  now: new Date("2026-07-17T18:00:00Z"),
  statusEvents: [],
  slots: [
    slot({ id: "slot-1", cleaner_account_id: dawnId, status: "declined", offered_at: "2026-07-17T14:00:00Z", declined_at: "2026-07-17T15:00:00Z" }),
    slot({ id: "slot-2", status: "stranded", created_at: "2026-07-17T15:00:01Z" }),
  ],
});
const escalationCodes = new Set(missingEscalationFindings.map((finding) => finding.code));
assert(escalationCodes.has("decline_without_admin_event"), "missing decline notification should be detected");
assert(escalationCodes.has("stranded_without_admin_event"), "missing stranded escalation should be detected");

const failedDeliveryFindings = analyzeStaffingAnomalies({
  jobs: [baseJob],
  assignments,
  cleanerNames,
  propertyNames,
  now: new Date("2026-07-17T18:00:00Z"),
  statusEvents: [
    { job_id: jobId, account_id: dawnId, event_type: "declined", created_at: "2026-07-17T15:00:01Z", push_sent_count: 0 },
    { job_id: jobId, account_id: null, event_type: "stranded", created_at: "2026-07-17T15:00:02Z", push_sent_count: 0 },
  ],
  slots: [
    slot({ id: "slot-1", cleaner_account_id: dawnId, status: "declined", offered_at: "2026-07-17T14:00:00Z", declined_at: "2026-07-17T15:00:00Z" }),
    slot({ id: "slot-2", status: "stranded", created_at: "2026-07-17T15:00:01Z" }),
  ],
});
const failedDeliveryCodes = new Set(failedDeliveryFindings.map((finding) => finding.code));
assert(failedDeliveryCodes.has("decline_notification_failed"), "zero-delivery decline notification should be detected");
assert(failedDeliveryCodes.has("stranded_notification_failed"), "zero-delivery stranded notification should be detected");

const expiredFindings = analyzeStaffingAnomalies({
  jobs: [baseJob],
  assignments,
  cleanerNames,
  propertyNames,
  now: new Date("2026-07-17T18:00:00Z"),
  statusEvents: [],
  slots: [
    slot({ id: "slot-1", cleaner_account_id: jackieId, status: "offered", offered_at: "2026-07-17T14:00:00Z", expires_at: "2026-07-17T17:00:00Z" }),
  ],
});
assert(expiredFindings.some((finding) => finding.code === "expired_offer"), "expired active offer should be detected");

console.log(`AI supervisor anomaly replay passed (${loopFindings.length + healthyFindings.length + missingEscalationFindings.length + failedDeliveryFindings.length + expiredFindings.length} evaluated findings).`);
