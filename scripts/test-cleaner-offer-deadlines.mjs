import assert from "node:assert/strict";
import {
  getCleanerOfferExpiresAtForDailySweep,
  getCleanerOfferResponseDays,
  getInitialCleanerOfferDeadline,
  isCleanerJobDatePast,
  isCleanerOfferInFinalWarningWindow,
} from "../lib/server/cleaner-offer-deadlines.ts";

const afterDailySweep = new Date("2026-08-14T13:00:00Z");
const eveningOffer = "2026-09-08T22:08:00Z";
for (const stored of [null, "invalid", "2026-09-09T06:08:00Z"]) {
  assert.equal(
    getInitialCleanerOfferDeadline("2026-09-12", eveningOffer, stored),
    "2026-09-09T14:00:00.000Z",
    "The screenshot's evening offer expires at 10 a.m. the next Toronto morning"
  );
}
assert.equal(
  getInitialCleanerOfferDeadline("2026-09-12", eveningOffer, "2026-09-11T12:00:00Z"),
  "2026-09-11T12:00:00Z",
  "Do not shorten a response window already promised to a cleaner"
);
for (const offeredAt of ["2026-09-08T11:00:00Z", eveningOffer, "2026-09-09T02:30:00Z"]) {
  assert.equal(
    getCleanerOfferExpiresAtForDailySweep("2026-09-12", new Date(offeredAt)),
    "2026-09-09T14:00:00.000Z",
    "Use the following local calendar morning, even for offers before 10 a.m. or after midnight UTC"
  );
}
for (const [jobDate, days, deadline] of [
  [null, 1, "2026-08-15T14:00:00.000Z"],
  ["invalid", 1, "2026-08-15T14:00:00.000Z"],
  ["2026-08-27", 1, "2026-08-15T14:00:00.000Z"],
  ["2026-08-28", 3, "2026-08-17T14:00:00.000Z"],
  ["2026-09-10", 3, "2026-08-17T14:00:00.000Z"],
  ["2026-09-11", 5, "2026-08-19T14:00:00.000Z"],
]) {
  assert.equal(getCleanerOfferResponseDays(jobDate, afterDailySweep), days);
  assert.equal(getCleanerOfferExpiresAtForDailySweep(jobDate, afterDailySweep), deadline);
}
for (const [offeredAt, deadline] of [
  ["2026-01-08T23:00:00Z", "2026-01-09T15:00:00.000Z"],
  ["2026-03-07T23:00:00Z", "2026-03-08T14:00:00.000Z"],
  ["2026-10-31T22:00:00Z", "2026-11-01T15:00:00.000Z"],
]) {
  assert.equal(getCleanerOfferExpiresAtForDailySweep(null, new Date(offeredAt)), deadline,
    "The deadline remains 10 a.m. in winter and across both daylight saving transitions");
}

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
