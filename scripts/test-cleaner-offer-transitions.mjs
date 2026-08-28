import assert from "node:assert/strict";
import { shouldReofferCleanerSlot } from "../lib/server/cleaner-offer-transition.ts";

const offeredAt = "2026-08-28T02:54:30.563117Z";
const expiresAt = "2026-08-29T12:00:00.000Z";
const slot = {
  cleaner_account_id: "cleaner-dawn",
  status: "offered",
  offered_at: offeredAt,
  expires_at: expiresAt,
};

assert.equal(
  shouldReofferCleanerSlot(slot),
  false,
  "a duplicate decline request must not rotate a newly active offer"
);

assert.equal(
  shouldReofferCleanerSlot({ ...slot, status: "declined" }),
  true,
  "an interactive decline may rotate a declined slot"
);

const expectedExpiredOffer = {
  cleanerAccountId: slot.cleaner_account_id,
  status: slot.status,
  offeredAt: slot.offered_at,
  expiresAt: slot.expires_at,
};

assert.equal(
  shouldReofferCleanerSlot(slot, expectedExpiredOffer, new Date("2026-08-28T03:00:00Z").getTime()),
  false,
  "the expiration sweep must not rotate an offer before its deadline"
);

assert.equal(
  shouldReofferCleanerSlot(slot, expectedExpiredOffer, new Date("2026-08-29T12:00:00Z").getTime()),
  true,
  "the expiration sweep may rotate an exact snapshot at its deadline"
);

assert.equal(
  shouldReofferCleanerSlot(
    { ...slot, offered_at: "2026-08-28T02:54:32.309Z" },
    expectedExpiredOffer,
    new Date("2026-08-30T12:00:00Z").getTime()
  ),
  false,
  "a stale expiration worker must not rotate a newer offer version"
);

console.log("Cleaner offer transition tests passed.");
