import assert from "node:assert/strict";
import {
  getCleanerOfferDeadline,
  getCleanerOfferTimeRemainingMs,
} from "../lib/cleaner-offer-countdown.ts";

const now = new Date("2026-08-31T13:59:00.000Z");
const storedDeadline = "2026-09-01T12:00:00.000Z";

assert.equal(
  getCleanerOfferDeadline(
    {
      expiresAt: storedDeadline,
      offeredAt: "2026-08-31T11:21:05.000Z",
      jobDate: "2026-09-06",
    },
    now
  )?.toISOString(),
  storedDeadline,
  "the cleaner portal must use the same stored deadline as email and offer rotation"
);

assert.equal(
  getCleanerOfferTimeRemainingMs(
    {
      expiresAt: storedDeadline,
      offeredAt: "2026-08-31T11:21:05.000Z",
      jobDate: "2026-09-06",
    },
    now
  ),
  22 * 60 * 60 * 1000 + 60 * 1000,
  "the displayed countdown must be calculated from expires_at"
);

assert.equal(
  getCleanerOfferDeadline(
    {
      expiresAt: "invalid",
      offeredAt: "2026-08-31T11:21:05.000Z",
      jobDate: "2026-09-06",
    },
    now
  )?.toISOString(),
  "2026-08-31T19:21:05.000Z",
  "legacy offers without a valid stored deadline keep the old fallback"
);

assert.equal(
  getCleanerOfferDeadline({ expiresAt: null, offeredAt: null, jobDate: "2026-09-06" }, now),
  null
);

console.log("Cleaner offer countdown tests passed.");
