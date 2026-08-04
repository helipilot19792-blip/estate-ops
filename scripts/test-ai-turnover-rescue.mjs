import assert from "node:assert/strict";
import { buildTurnoverRescuePlans } from "../lib/server/ai-turnover-rescue.ts";

const todayYmd = "2026-08-04";
const tomorrowYmd = "2026-08-05";
const propertyId = "property-1";
const baseJob = {
  id: "job-open",
  property_id: propertyId,
  scheduled_for: todayYmd,
  cleaner_units_needed: 1,
  status: "open",
};
const cleaners = [
  { id: "cleaner-priority", display_name: "Priority Cleaner", active: true },
  { id: "cleaner-reliable", display_name: "Reliable Cleaner", active: true },
  { id: "cleaner-conflict", display_name: "Busy Cleaner", active: true },
  { id: "cleaner-inactive", display_name: "Inactive Cleaner", active: false },
];
const assignments = cleaners.map((cleaner, index) => ({
  property_id: propertyId,
  cleaner_account_id: cleaner.id,
  priority: index + 1,
}));
const members = cleaners.map((cleaner) => ({ cleaner_account_id: cleaner.id, profile_id: `profile-${cleaner.id}` }));
const openSlot = {
  id: "slot-open",
  job_id: baseJob.id,
  cleaner_account_id: null,
  status: "stranded",
  offered_at: null,
  accepted_at: null,
  declined_at: null,
  expires_at: null,
};
const conflictJob = { ...baseJob, id: "job-conflict", property_id: "property-2", status: "accepted" };
const conflictSlot = {
  ...openSlot,
  id: "slot-conflict",
  job_id: conflictJob.id,
  cleaner_account_id: "cleaner-conflict",
  status: "accepted",
  accepted_at: "2026-08-03T12:00:00Z",
};

const ranked = buildTurnoverRescuePlans({
  jobs: [baseJob, conflictJob],
  slots: [openSlot, conflictSlot],
  assignments,
  cleaners,
  members,
  historySlots: [
    ...Array.from({ length: 5 }, () => ({ cleaner_account_id: "cleaner-reliable", status: "accepted" })),
    { cleaner_account_id: "cleaner-priority", status: "accepted" },
    { cleaner_account_id: "cleaner-priority", status: "declined" },
  ],
  propertyNames: new Map([[propertyId, "Lake House"]]),
  todayYmd,
  tomorrowYmd,
  now: new Date("2026-08-04T10:00:00Z"),
});

assert.equal(ranked.plans.length, 1, "one uncovered job should produce one rescue plan");
assert.equal(ranked.plans[0].propertyName, "Lake House");
assert.equal(ranked.plans[0].candidates[0].cleanerAccountId, "cleaner-reliable", "reliability can lift a lower property priority");
assert(!ranked.plans[0].candidates.some((candidate) => candidate.cleanerAccountId === "cleaner-conflict"), "same-day accepted conflicts must be excluded");
assert(!ranked.plans[0].candidates.some((candidate) => candidate.cleanerAccountId === "cleaner-inactive"), "inactive cleaners must be excluded");
assert.equal(ranked.plans[0].excludedConflictCount, 1);

const waiting = buildTurnoverRescuePlans({
  jobs: [baseJob],
  slots: [{ ...openSlot, cleaner_account_id: "cleaner-priority", status: "offered", expires_at: "2026-08-04T14:00:00Z" }],
  assignments,
  cleaners,
  members,
  historySlots: [],
  propertyNames: new Map(),
  todayYmd,
  tomorrowYmd,
  now: new Date("2026-08-04T10:00:00Z"),
});
assert.equal(waiting.plans.length, 0, "an active unexpired offer should stay in waiting instead of producing a duplicate rescue");
assert.equal(waiting.coverage.waiting, 1);

const expired = buildTurnoverRescuePlans({
  jobs: [baseJob],
  slots: [{ ...openSlot, cleaner_account_id: "cleaner-priority", status: "offered", expires_at: "2026-08-04T09:00:00Z" }],
  assignments,
  cleaners,
  members,
  historySlots: [],
  propertyNames: new Map(),
  todayYmd,
  tomorrowYmd,
  now: new Date("2026-08-04T10:00:00Z"),
});
assert.equal(expired.plans.length, 1, "an expired offer should return as a rescue escalation");

const accepted = buildTurnoverRescuePlans({
  jobs: [baseJob],
  slots: [{ ...openSlot, cleaner_account_id: "cleaner-priority", status: "accepted", accepted_at: "2026-08-04T09:30:00Z" }],
  assignments,
  cleaners,
  members,
  historySlots: [],
  propertyNames: new Map(),
  todayYmd,
  tomorrowYmd,
  now: new Date("2026-08-04T10:00:00Z"),
});
assert.equal(accepted.plans.length, 0);
assert.equal(accepted.coverage.resolved, 1, "accepted coverage should appear in the covered brief count");

const inconsistentMultiUnit = buildTurnoverRescuePlans({
  jobs: [{ ...baseJob, cleaner_units_needed: 2 }],
  slots: [{ ...openSlot, cleaner_account_id: "cleaner-priority", status: "accepted", accepted_at: "2026-08-04T09:30:00Z" }],
  assignments,
  cleaners,
  members,
  historySlots: [],
  propertyNames: new Map(),
  todayYmd,
  tomorrowYmd,
  now: new Date("2026-08-04T10:00:00Z"),
});
assert.equal(inconsistentMultiUnit.plans.length, 0, "an inconsistent multi-unit job must never propose replacing its accepted slot");

console.log("AI turnover rescue replay passed (ranking, conflicts, waiting, escalation, and resolution).")
