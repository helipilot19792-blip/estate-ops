import assert from "node:assert/strict";
import {
  calculateCleanerOfferEligibleDate,
  getCleanerOfferHoldDecision,
  normalizeManualCleanerOfferLeadDays,
  normalizePropertyCleanerOfferLeadDays,
} from "../lib/server/cleaner-offer-hold.ts";

assert.equal(calculateCleanerOfferEligibleDate("2027-07-15", 90), "2027-04-16");
assert.equal(calculateCleanerOfferEligibleDate("2028-03-01", 180), "2027-09-03");
assert.equal(calculateCleanerOfferEligibleDate("invalid", 90), null);

assert.equal(normalizePropertyCleanerOfferLeadDays(60), 60);
assert.equal(normalizePropertyCleanerOfferLeadDays("180"), 180);
assert.equal(normalizePropertyCleanerOfferLeadDays(30), 90);
assert.equal(normalizeManualCleanerOfferLeadDays(0, 90), 0);
assert.equal(normalizeManualCleanerOfferLeadDays("property", 180), 180);

assert.deepEqual(getCleanerOfferHoldDecision("2027-07-15", 90, "2027-04-15"), {
  leadDays: 90,
  offerEligibleAt: "2027-04-16",
  held: true,
});
assert.equal(
  getCleanerOfferHoldDecision("2027-07-15", 90, "2027-04-16").held,
  false,
  "the offer releases on the eligibility date"
);
assert.equal(
  getCleanerOfferHoldDecision("2027-07-15", 0, "2026-01-01").held,
  false,
  "manual send-now jobs are never held"
);

console.log("Cleaner offer hold tests passed.");

