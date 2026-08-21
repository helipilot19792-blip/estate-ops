import assert from "node:assert/strict";

process.env.JOB_EMAIL_ACTION_SECRET = "test-only-calendar-signing-secret";

const { createJobEmailActionUrl, verifyJobEmailActionUrl } = await import(
  "../lib/server/job-email-actions.ts"
);

const activeUrl = new URL(
  createJobEmailActionUrl(
    "https://portal.example.test",
    "cleaner",
    "calendar",
    "slot-123",
    "Cleaner@Example.com",
    { expiresAtMs: Date.now() + 60_000, offerVersion: "offer-v1" }
  )
);
const valid = verifyJobEmailActionUrl(activeUrl.searchParams);
assert.equal(valid.ok, true);
assert.equal(valid.ok && valid.email, "cleaner@example.com");
assert.equal(valid.ok && valid.slotId, "slot-123");

const tampered = new URL(activeUrl);
tampered.searchParams.set("slot", "slot-999");
assert.equal(verifyJobEmailActionUrl(tampered.searchParams).ok, false);

const expiredUrl = new URL(
  createJobEmailActionUrl(
    "https://portal.example.test",
    "cleaner",
    "calendar",
    "slot-123",
    "cleaner@example.com",
    { expiresAtMs: Date.now() - 1, offerVersion: "offer-v1" }
  )
);
assert.equal(verifyJobEmailActionUrl(expiredUrl.searchParams).ok, false);

console.log("Job email signature tests passed.");
