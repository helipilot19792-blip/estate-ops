import assert from "node:assert/strict";
import { findNextEligibleCleanerAssignment } from "../lib/server/cleaner-offer-eligibility.ts";

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

console.log("Cleaner offer eligibility tests passed.");
