import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";

function load(path, modules) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  });
  return exports;
}

const reads = [];
const service = { from(table) {
  reads.push(table);
  assert.equal(table, "booking_gap_watch_settings", "Disabled watch must never read calendars or bookings");
  const query = {
    select() { return query; }, eq() { return query; },
    async maybeSingle() { return { data: { enabled: false }, error: null }; },
  };
  return query;
} };
const route = load("../app/api/admin/booking-gap-suggestions/route.ts", {
  "@/lib/booking-gap-watch": {
    addDaysYmd() { assert.fail("Disabled watch must not calculate a scan horizon"); },
    detectBookingGapSuggestions() { assert.fail("Disabled watch must not scan"); },
    detectPortfolioSeasonality() { assert.fail("Disabled watch must not analyze seasonality"); },
  },
  "@/lib/server/audit-log": {},
  "@/lib/server/organization-access": { requireOrganizationAdmin: async () => ({ id: "admin" }), getOrganizationAccessErrorStatus: () => 500 },
  "@/lib/server/request-auth": { authenticateBearerRequest: async () => ({ ok: true, user: { id: "admin" } }), createServiceRoleClient: () => service },
  "@/lib/server/workspace-billing-status": { assertWorkspaceBillingAccessForOrganization: async () => {}, getWorkspaceBillingErrorStatus: () => 500 },
});
const response = await route.GET(new Request("https://test.invalid/api/admin/booking-gap-suggestions?organizationId=org"));
assert.equal(response.status, 200);
const payload = await response.json();
assert.equal(payload.enabled, false);
assert.equal(payload.analyzedPropertyCount, 0);
assert.deepEqual(payload.suggestions, []);
assert.deepEqual(reads, ["booking_gap_watch_settings"]);

const component = load("../components/admin/booking-gap-watch.tsx", {
  react: React,
  "react/jsx-runtime": await import("react/jsx-runtime"),
  "lucide-react": icons,
  "@/lib/supabase": {},
}).default;
const html = renderToStaticMarkup(React.createElement(component, { organizationId: "org" }));
assert.match(html, /Checking setting/);
assert.doesNotMatch(html, /Scanning|Comparing upcoming|Promotion opportunities|connected properties/);
console.log("Booking Gap Watch: disabled requests skip scan data; initial UI checks settings without claiming to scan.");
