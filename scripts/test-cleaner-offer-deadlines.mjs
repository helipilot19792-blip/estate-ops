import assert from "node:assert/strict";
import {
  getCleanerOfferExpiresAtForDailySweep,
  getCleanerOfferResponseDays,
} from "../lib/server/cleaner-offer-deadlines.ts";

const afterDailySweep = new Date("2026-08-14T13:00:00Z");

assert.equal(getCleanerOfferResponseDays("2026-09-15", afterDailySweep), 5);
assert.equal(getCleanerOfferExpiresAtForDailySweep("2026-09-15", afterDailySweep), "2026-08-19T12:00:00.000Z");

assert.equal(getCleanerOfferResponseDays("2026-08-30", afterDailySweep), 3);
assert.equal(getCleanerOfferExpiresAtForDailySweep("2026-08-30", afterDailySweep), "2026-08-17T12:00:00.000Z");

assert.equal(getCleanerOfferResponseDays("2026-08-20", afterDailySweep), 2);
assert.equal(getCleanerOfferExpiresAtForDailySweep("2026-08-20", afterDailySweep), "2026-08-16T12:00:00.000Z");

assert.equal(getCleanerOfferResponseDays("2026-08-16", afterDailySweep), 1);
assert.equal(getCleanerOfferExpiresAtForDailySweep("2026-08-16", afterDailySweep), "2026-08-15T12:00:00.000Z");

const beforeDailySweep = new Date("2026-08-14T11:00:00Z");
assert.equal(getCleanerOfferExpiresAtForDailySweep("2026-09-15", beforeDailySweep), "2026-08-18T12:00:00.000Z");

console.log("Cleaner offer deadline tests passed.");
