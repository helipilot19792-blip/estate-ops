import assert from "node:assert/strict";
import {
  getSyncedCleanerJobDate,
  getSyncedCleanerScheduleChange,
} from "../lib/server/synced-cleaner-schedule.ts";

assert.equal(
  getSyncedCleanerJobDate({ scheduled_for: "2026-08-30", notes: "Checkout date: 2026-08-29" }),
  "2026-08-30",
  "the explicit job date must take precedence over notes"
);

assert.equal(
  getSyncedCleanerJobDate({ scheduled_for: null, notes: "Checkout date: 2026-08-30" }),
  "2026-08-30",
  "legacy synced jobs must recover their date from notes"
);

assert.deepEqual(
  getSyncedCleanerScheduleChange({ scheduled_for: "2026-08-30" }, "2026-08-31"),
  {
    changed: true,
    previousScheduledFor: "2026-08-30",
    replacementScheduledFor: "2026-08-31",
  },
  "a moved checkout must cancel and replace the old cleaning"
);

assert.equal(
  getSyncedCleanerScheduleChange({ scheduled_for: "2026-08-31" }, "2026-08-31").changed,
  false,
  "an unchanged checkout must not restart staffing"
);

assert.equal(
  getSyncedCleanerScheduleChange({ scheduled_for: null, notes: null }, "2026-08-31").changed,
  false,
  "a missing legacy date is a metadata update, not a destructive replacement"
);

console.log("Synced cleaner schedule tests passed.");
