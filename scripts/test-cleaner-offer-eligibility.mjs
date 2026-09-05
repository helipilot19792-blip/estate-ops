import assert from "node:assert/strict";
import {
  findNextEligibleCleanerAssignment,
  isSeedableCleanerOfferSlot,
} from "../lib/server/cleaner-offer-eligibility.ts";

const jackie = { cleaner_account_id: "jackie", priority: 1 };
const dawn = { cleaner_account_id: "dawn", priority: 2 };
const reagan = { cleaner_account_id: "reagan", priority: 3 };
const assignments = [jackie, dawn, reagan];

const afterJackie = findNextEligibleCleanerAssignment({
  assignments,
  assignmentMode: "priority",
  currentCleanerAccountId: "jackie",
  declinedCleanerIds: new Set(["jackie"]),
  unavailableCleanerIds: new Set(),
});
assert.equal(afterJackie.nextAssignment?.cleaner_account_id, "dawn");

const afterRepeatedDeclines = findNextEligibleCleanerAssignment({
  assignments,
  assignmentMode: "priority",
  currentCleanerAccountId: "dawn",
  declinedCleanerIds: new Set(["jackie", "dawn"]),
  unavailableCleanerIds: new Set(),
});
assert.equal(afterRepeatedDeclines.nextAssignment?.cleaner_account_id, "reagan");

const nobodyLeft = findNextEligibleCleanerAssignment({
  assignments,
  assignmentMode: "priority",
  currentCleanerAccountId: "dawn",
  declinedCleanerIds: new Set(["jackie", "dawn", "reagan"]),
  unavailableCleanerIds: new Set(),
});
assert.equal(nobodyLeft.nextAssignment, null);

const rotationWrapsAndSkipsDeclines = findNextEligibleCleanerAssignment({
  assignments,
  assignmentMode: "training_rotation",
  currentCleanerAccountId: "reagan",
  declinedCleanerIds: new Set(["reagan", "jackie"]),
  unavailableCleanerIds: new Set(),
});
assert.equal(rotationWrapsAndSkipsDeclines.nextAssignment?.cleaner_account_id, "dawn");

assert.equal(
  isSeedableCleanerOfferSlot({ status: "open", offered_at: null }),
  true,
  "A new open slot may receive its initial priority offer"
);
assert.equal(
  isSeedableCleanerOfferSlot({ status: "assigned", offered_at: null }),
  true,
  "A never-offered assigned slot may receive its initial priority offer"
);
assert.equal(
  isSeedableCleanerOfferSlot({ status: "declined", offered_at: "2026-09-05T18:09:46.000Z" }),
  false,
  "A declined offer must advance through the offer chain instead of resetting to priority one"
);
assert.equal(
  isSeedableCleanerOfferSlot({ status: "open", offered_at: "2026-09-05T18:09:46.000Z" }),
  false,
  "Any slot with prior offer history must not be reseeded"
);
assert.equal(
  isSeedableCleanerOfferSlot({ status: "stranded", offered_at: null }),
  false,
  "A stranded slot must remain under explicit recovery control"
);

console.log("Cleaner offer eligibility tests passed.");
