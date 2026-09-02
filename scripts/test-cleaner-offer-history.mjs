import assert from "node:assert/strict";
import {
  getUnrepresentedCleanerDeclines,
  isCleanerReassignmentAuditAction,
  isCleanerReleaseToStrandedAuditAction,
} from "../lib/cleaner-offer-history.ts";

const jackieAccountId = "jackie";
const dawnAccountId = "dawn";
const reaganAccountId = "reagan";

const logs = [
  {
    id: "jackie-decline",
    action_type: "cleaner.portal_job_decline",
    created_at: "2026-09-02T02:14:00.397Z",
    metadata: {
      job_id: "lincoln-job",
      cleaner_account_id: jackieAccountId,
      previous_status: "offered",
    },
  },
  {
    id: "dawn-reassignment",
    action_type: "admin.reassign_cleaner_slot",
    created_at: "2026-09-02T12:01:15.378Z",
    metadata: {
      job_id: "lincoln-job",
      reassign_source: "priority_expired",
      previous_cleaner_account_id: dawnAccountId,
      previous_status: "offered",
      previous_offered_at: "2026-09-02T02:13:59.053Z",
      new_cleaner_account_id: reaganAccountId,
    },
  },
];

assert.deepEqual(
  getUnrepresentedCleanerDeclines(logs, {
    cleanerAccountId: reaganAccountId,
    status: "offered",
  }),
  [{
    id: "jackie-decline",
    cleanerAccountId: jackieAccountId,
    source: "portal",
    offeredAt: null,
    declinedAt: "2026-09-02T02:14:00.397Z",
  }],
  "A standalone Jackie decline must remain visible after the same slot moves to Dawn and Reagan"
);

const representedDeclineLogs = [
  ...logs,
  {
    id: "jackie-reassignment",
    action_type: "admin.reassign_cleaner_slot",
    created_at: "2026-09-02T02:14:01.000Z",
    metadata: {
      reassign_source: "priority_declined",
      previous_cleaner_account_id: jackieAccountId,
      previous_status: "declined",
    },
  },
];

assert.deepEqual(
  getUnrepresentedCleanerDeclines(representedDeclineLogs, {
    cleanerAccountId: reaganAccountId,
    status: "offered",
  }),
  [],
  "A direct decline must not duplicate a decline already represented by reassignment history"
);

assert.equal(isCleanerReassignmentAuditAction("cleaner.release_cleaner_slot"), true);
assert.equal(isCleanerReassignmentAuditAction("ai.supervisor.turnover_rescue_approved"), true);
assert.equal(isCleanerReleaseToStrandedAuditAction("admin.approve_cleaner_release_request"), true);
assert.equal(isCleanerReleaseToStrandedAuditAction("admin.release_cleaner_future_job_stranded"), true);

const aiRepresentedDeclineLogs = [
  logs[0],
  {
    id: "ai-reassignment",
    action_type: "ai.supervisor.turnover_rescue_approved",
    created_at: "2026-09-02T02:14:01.000Z",
    metadata: {
      reassign_source: "ai_supervisor_turnover_rescue_declined",
      previous_cleaner_account_id: jackieAccountId,
      previous_status: "declined",
    },
  },
];

assert.deepEqual(
  getUnrepresentedCleanerDeclines(aiRepresentedDeclineLogs, {
    cleanerAccountId: reaganAccountId,
    status: "offered",
  }),
  [],
  "AI reassignment history must not duplicate the cleaner's direct decline event"
);

console.log("Cleaner offer history tests passed.");
