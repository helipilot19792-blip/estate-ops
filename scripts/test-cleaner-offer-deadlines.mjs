import assert from "node:assert/strict";
import {
  getCleanerOfferExpiresAtForDailySweep,
  getCleanerOfferResponseDays,
  isCleanerJobDatePast,
  isCleanerOfferInFinalWarningWindow,
} from "../lib/server/cleaner-offer-deadlines.ts";

const afterDailySweep = new Date("2026-08-14T13:00:00Z");

assert.equal(getCleanerOfferResponseDays("2026-09-15", afterDailySweep), 5);
assert.equal(getCleanerOfferExpiresAtForDailySweep("2026-09-15", afterDailySweep), "2026-08-19T12:00:00.000Z");

assert.equal(getCleanerOfferResponseDays("2026-08-30", afterDailySweep), 3);
assert.equal(getCleanerOfferExpiresAtForDailySweep("2026-08-30", afterDailySweep), "2026-08-17T12:00:00.000Z");

assert.equal(getCleanerOfferResponseDays("2026-08-20", afterDailySweep), 2);
assert.equal(getCleanerOfferExpiresAtForDailySweep("2026-08-20", afterDailySweep), "2026-08-16T12:00:00.000Z");

assert.equal(getCleanerOfferResponseDays("2026-08-16", afterDailySweep), 1);
assert.equal(getCleanerOfferExpiresAtForDailySweep("2026-08-16", afterDailySweep), "2026-08-16T12:00:00.000Z");

const beforeDailySweep = new Date("2026-08-14T11:00:00Z");
assert.equal(getCleanerOfferExpiresAtForDailySweep("2026-09-15", beforeDailySweep), "2026-08-18T12:00:00.000Z");

const dawnOfferTime = new Date("2026-09-02T02:13:59.053Z");
assert.equal(getCleanerOfferResponseDays("2026-09-06", dawnOfferTime), 2);
assert.equal(
  getCleanerOfferExpiresAtForDailySweep("2026-09-06", dawnOfferTime),
  "2026-09-03T12:00:00.000Z",
  "A September 6 job offered late on September 1 must not expire at the September 2 sweep"
);

assert.equal(
  getCleanerOfferExpiresAtForDailySweep("2026-09-03", dawnOfferTime),
  "2026-09-03T12:00:00.000Z",
  "Toronto calendar dates must treat September 3 as beyond tomorrow when offered late on September 1"
);

const lateDayBeforeTomorrow = new Date("2026-09-02T13:00:00Z");
assert.equal(
  getCleanerOfferExpiresAtForDailySweep("2026-09-04", lateDayBeforeTomorrow),
  "2026-09-04T12:00:00.000Z",
  "A non-next-day job must receive at least 24 full hours even when offered after the daily sweep"
);
assert.equal(
  getCleanerOfferExpiresAtForDailySweep("2026-09-03", lateDayBeforeTomorrow),
  "2026-09-03T12:00:00.000Z",
  "A next-day job may use the next available sweep deadline"
);

assert.equal(isCleanerJobDatePast("2026-08-13", afterDailySweep), true);
assert.equal(isCleanerJobDatePast("2026-08-14", afterDailySweep), false);
assert.equal(isCleanerJobDatePast("2026-08-15", afterDailySweep), false);
assert.equal(
  isCleanerJobDatePast("2026-09-01", new Date("2026-09-02T02:30:00Z")),
  false,
  "A job remains today's job until the Toronto calendar day ends"
);

assert.equal(isCleanerOfferInFinalWarningWindow("2026-08-15T12:00:00.000Z", afterDailySweep), true);
assert.equal(isCleanerOfferInFinalWarningWindow("2026-08-16T12:00:00.000Z", afterDailySweep), false);
assert.equal(isCleanerOfferInFinalWarningWindow("2026-08-14T12:00:00.000Z", afterDailySweep), false);

console.log("Cleaner offer deadline tests passed.");
