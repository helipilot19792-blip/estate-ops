import assert from "node:assert/strict";
import {
  assertWorkspaceBillingAccess,
  getWorkspaceBillingErrorStatus,
  getWorkspaceBillingState,
} from "../lib/server/workspace-billing-status.ts";

const now = new Date("2026-08-21T12:00:00.000Z");

assert.equal(
  getWorkspaceBillingState({ subscription_status: "active", account_type: "customer" }, now)
    .trialEnded,
  false
);
assert.doesNotThrow(() =>
  assertWorkspaceBillingAccess(
    { subscription_status: "trialing", trial_ends_at: "2026-08-22T00:00:00.000Z" },
    { now }
  )
);
assert.doesNotThrow(() =>
  assertWorkspaceBillingAccess({ subscription_status: "past_due" }, { now })
);
assert.doesNotThrow(() =>
  assertWorkspaceBillingAccess(
    { subscription_status: "trialing", trial_ends_at: "2020-01-01T00:00:00.000Z", account_type: "internal" },
    { now }
  )
);

for (const organization of [
  { subscription_status: "trialing", trial_ends_at: "2026-08-20T00:00:00.000Z" },
  { subscription_status: "canceled" },
  { subscription_status: "suspended" },
]) {
  assert.throws(
    () => assertWorkspaceBillingAccess(organization, { now }),
    (error) => getWorkspaceBillingErrorStatus(error) === 402
  );
}

assert.throws(
  () =>
    assertWorkspaceBillingAccess(
      { subscription_status: "past_due" },
      { now, blockPastDue: true }
    ),
  (error) => getWorkspaceBillingErrorStatus(error) === 402
);

console.log("workspace billing tests passed");
