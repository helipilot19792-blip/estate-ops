import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildAdminV2Briefing } from "../lib/admin-v2/briefing.ts";

const briefing = buildAdminV2Briefing({
  organization: { id: "org-a", name: "Demo Operations" },
  generatedAt: "2026-08-17T14:00:00.000Z",
  todayYmd: "2026-08-17",
  windowEndYmd: "2026-08-31",
  properties: [
    { id: "property-ready", name: "Harbour House", address: "10 Demo Lane" },
    { id: "property-new", name: "Forest Cabin", address: null },
  ],
  jobs: [
    {
      id: "job-uncovered",
      property_id: "property-ready",
      scheduled_for: "2026-08-17",
      status: "offered",
      staffing_status: "unfilled",
      cleaner_units_needed: 1,
      schedule_conflict_at: null,
      schedule_conflict_reason: null,
    },
    {
      id: "job-conflict",
      property_id: "property-ready",
      scheduled_for: "2026-08-18",
      status: "accepted",
      staffing_status: "conflict",
      cleaner_units_needed: 1,
      schedule_conflict_at: "2026-08-17T13:00:00.000Z",
      schedule_conflict_reason: "One cleaner is already committed.",
    },
  ],
  slots: [
    { id: "slot-open", job_id: "job-uncovered", cleaner_account_id: null, status: "stranded", expires_at: null },
    { id: "slot-covered", job_id: "job-conflict", cleaner_account_id: "cleaner-1", status: "accepted", expires_at: null },
  ],
  bookings: [
    { id: "booking-1", property_id: "property-ready", checkin_date: "2026-08-17", checkout_date: "2026-08-17", guest_count: 4 },
    { id: "booking-2", property_id: "property-new", checkin_date: "2026-08-19", checkout_date: "2026-08-22", guest_count: null },
  ],
  maintenance: [
    { id: "maintenance-open", property_id: "property-ready", category: "Safety", urgency: "high", status: "open", flagged_at: "2026-08-17", created_at: "2026-08-16" },
    { id: "maintenance-closed", property_id: "property-ready", category: "Lighting", urgency: "low", status: "resolved", flagged_at: "2026-08-15", created_at: "2026-08-15" },
  ],
  inspections: [
    { id: "inspection-overdue", property_id: "property-ready", title: "Safety inspection", next_due_date: "2026-08-16", active: true },
  ],
  accessRows: [{ property_id: "property-ready" }],
  calendars: [{ property_id: "property-ready", is_active: true }],
  sops: [{ property_id: "property-ready" }],
  checklistItems: [{ property_id: "property-ready" }],
  knowledgeRows: [],
  teamMembers: [{ profile_id: "admin-1", role: "admin" }, { profile_id: "cleaner-1", role: "cleaner" }],
});

assert.equal(briefing.organization.id, "org-a");
assert.equal(briefing.metrics.propertyCount, 2);
assert.equal(briefing.metrics.arrivalsToday, 1);
assert.equal(briefing.metrics.departuresToday, 1);
assert.equal(briefing.metrics.turnoversToday, 1);
assert.equal(briefing.metrics.coveredTurnoversToday, 0);
assert.equal(briefing.metrics.openMaintenance, 1);
assert.equal(briefing.metrics.overdueInspections, 1);
assert.equal(briefing.guardrails.mode, "read-only");
assert.equal(briefing.guardrails.externalActionsEnabled, false);
assert(briefing.attention.some((item) => item.id === "coverage-job-uncovered" && item.severity === "urgent"));
assert(briefing.attention.some((item) => item.id === "conflict-job-conflict"));
assert(briefing.attention.some((item) => item.id === "maintenance-maintenance-open"));
assert(briefing.attention.some((item) => item.id === "inspection-inspection-overdue"));
assert(briefing.attention.some((item) => item.id === "setup-property-new"));
assert.equal(briefing.attention.some((item) => item.id === "maintenance-maintenance-closed"), false);
assert.deepEqual(briefing.timeline.slice(0, 3).map((item) => item.kind), ["checkout", "turnover", "arrival"]);
assert.equal(briefing.properties[0].id, "property-new", "least-ready property should be first");

const [dataSource, routeSource] = await Promise.all([
  readFile(new URL("../lib/server/admin-v2/briefing.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin-v2/briefing/route.ts", import.meta.url), "utf8"),
]);

assert.equal(dataSource.includes('.select("*")'), false, "Phase 3 must use explicit safe columns");
assert((dataSource.match(/\.eq\("organization_id", organizationId\)/g) || []).length >= 7, "organization-scoped root queries are required");
assert(dataSource.includes("access.organizations.find"), "the selected organization must be checked against authorized organizations");
assert(routeSource.includes('"Cache-Control": "private, no-store"'), "live organization data must not be shared-cached");

console.log("Admin V2 live briefing analysis, DTO, organization scope, and read-only checks passed.");
