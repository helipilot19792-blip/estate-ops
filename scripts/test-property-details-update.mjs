import assert from "node:assert/strict";
import { buildPropertyDetailsUpdatePayload } from "../lib/server/property-details-update.ts";

assert.deepEqual(
  buildPropertyDetailsUpdatePayload({
    organizationId: "org-1",
    propertyId: "property-1",
    defaultCleanerUnitsNeeded: 2,
    defaultTurnoverPayout: 150,
  }),
  {},
  "a staffing-only save must preserve unrelated property details"
);

assert.deepEqual(
  buildPropertyDetailsUpdatePayload({
    organizationId: "org-1",
    propertyId: "property-1",
    cleanerAssignmentMode: "priority",
  }),
  {},
  "a cleaner-mode save must preserve unrelated property details"
);

assert.deepEqual(
  buildPropertyDetailsUpdatePayload({
    wifiNetwork: "  Beach House Wi-Fi  ",
    garbageDay: "Garbage, Recycling",
    garbageNotes: "  Put bins at the curb  ",
    garbagePickupWeekday: "1",
    garbageRotationAnchorDate: "2026-05-11",
    garbageWeekALabel: "Garbage + recycling",
    garbageWeekBLabel: "Recycling only",
    latitude: "42.8",
    longitude: "-79.1",
    defaultCheckinTime: "16:00",
    defaultCheckoutTime: "10:00",
  }),
  {
    wifi_network: "Beach House Wi-Fi",
    garbage_day: "Garbage, Recycling",
    garbage_notes: "Put bins at the curb",
    garbage_rotation_anchor_date: "2026-05-11",
    garbage_pickup_weekday: 1,
    garbage_week_a_label: "Garbage + recycling",
    garbage_week_b_label: "Recycling only",
    latitude: 42.8,
    longitude: -79.1,
    default_checkin_time: "16:00",
    default_checkout_time: "10:00",
  },
  "explicit property details must still be normalized and saved"
);

assert.deepEqual(
  buildPropertyDetailsUpdatePayload({
    wifiNetwork: "",
    garbagePickupWeekday: null,
    garbageWeekALabel: "",
    garbageWeekBLabel: "",
    latitude: "not-a-coordinate",
    defaultCheckinTime: "25:00",
  }),
  {
    wifi_network: null,
    garbage_pickup_weekday: null,
    garbage_week_a_label: "Garbage + recycling",
    garbage_week_b_label: "Recycling only",
    latitude: "",
    default_checkin_time: "",
  },
  "explicit clears and invalid values must retain the route's existing semantics"
);

console.log("Property details update tests passed.");
