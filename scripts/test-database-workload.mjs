import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(path, modules = {}, extra = "") {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8") + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", "process", code)(exports, (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  }, { env: { NEXT_PUBLIC_SUPABASE_URL: "https://test.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test", SUPABASE_SERVICE_ROLE_KEY: "test" } });
  return exports;
}
const workload = load("../lib/database-workload.ts");
const queue = workload.createRefreshQueue();
let release;
let runs = 0;
const first = queue(async () => { runs++; await new Promise((resolve) => { release = resolve; }); });
await Promise.resolve();
const waiting = Array.from({ length: 20 }, () => queue(async () => { runs++; }));
assert.equal(runs, 1);
release();
await Promise.all([first, ...waiting]);
assert.equal(runs, 2, "A burst during a request gets exactly one trailing refresh");
await assert.rejects(queue(async () => { throw new Error("offline"); }), /offline/);
await queue(async () => { runs++; });
assert.equal(runs, 3, "A failed refresh must not poison subsequent refreshes");

const now = Date.now();
assert.equal(workload.needsDeviceHeartbeat(null, now), true);
assert.equal(workload.needsDeviceHeartbeat(new Date(now - 299999).toISOString(), now), false);
assert.equal(workload.needsDeviceHeartbeat(new Date(now - 300000).toISOString(), now), true);

// Execute the component's actual Realtime callback, with state/fetch boundaries.
const bulletinSource = ts.createSourceFile("team-bulletin.tsx", readFileSync(new URL("../components/team/team-bulletin.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let participantCallback;
function findParticipantCallback(node) {
  if (ts.isCallExpression(node) && node.arguments[1]?.getText(bulletinSource).includes('table: "chat_participants"')) {
    participantCallback = node.arguments[2].getText(bulletinSource);
  }
  ts.forEachChild(node, findParticipantCallback);
}
findParticipantCallback(bulletinSource);
assert.ok(participantCallback);
let participants = [{ id: "participant", last_read_at: null, display_name: "Reader" }];
let boardReloads = 0;
const callbackExports = {};
const callbackCode = ts.transpileModule(`export const handle = ${participantCallback}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function("exports", "setParticipants", "loadBoard", callbackCode)(callbackExports, (update) => { participants = update(participants); }, () => { boardReloads++; });
callbackExports.handle({ eventType: "UPDATE", new: { id: "participant", last_read_at: "2026-09-10T12:00:00Z" } });
assert.equal(boardReloads, 0);
assert.equal(participants[0].last_read_at, "2026-09-10T12:00:00Z");
assert.equal(participants[0].display_name, "Reader");
callbackExports.handle({ eventType: "INSERT", new: { id: "new-participant" } });
callbackExports.handle({ eventType: "DELETE", old: { id: "participant" } });
assert.equal(boardReloads, 2, "Membership changes must still reload the board");

// Execute the actual sync function with a database boundary; no network access.
let existing = null;
let writes = 0;
let failRead = false;
const service = { from(table) {
  assert.equal(table, "property_booking_events");
  let payload;
  const q = {
    select() { return q; }, eq() { return q; },
    maybeSingle: async () => ({ data: existing, error: failRead ? new Error("offline") : null }),
    upsert(value) { payload = value; return q; },
    single: async () => { writes++; existing = { id: "booking", ...payload }; return { data: existing, error: null }; },
  };
  return q;
} };
const syncSource = readFileSync(new URL("../app/api/sync-calendars/route.ts", import.meta.url), "utf8");
const syncModules = Object.fromEntries([...syncSource.matchAll(/from\s+"([^"]+)"/g)].map((match) => [match[1], {}]));
syncModules["@supabase/supabase-js"] = { createClient: () => service };
syncModules["@/lib/database-workload"] = workload;
const sync = load("../app/api/sync-calendars/route.ts", syncModules, "\nexport { upsertBookingEvent }; ").upsertBookingEvent;
const calendar = { id: "calendar", property_id: "property", source: "airbnb" };
const property = { organization_id: "org" };
const event = { summary: "Reservation", guestCount: 2, checkinDate: "2026-09-10", checkoutDate: "2026-09-12", dtstartRaw: "20260910", dtendRaw: "20260912" };
assert.equal(await sync(calendar, property, event, "uid"), "booking");
await sync(calendar, property, event, "uid");
assert.equal(writes, 1, "Unchanged feed entries must not be rewritten");
await sync(calendar, property, { ...event, checkoutDate: "2026-09-13" }, "uid");
assert.equal(writes, 2, "Date changes must still persist");
existing.summary = "Manually named guest";
existing.guest_count = 5;
existing.updated_at = new Date(Date.parse(existing.last_seen_at) + 1000).toISOString();
await sync(calendar, property, { ...event, checkoutDate: "2026-09-13" }, "uid");
assert.equal(writes, 2);
assert.equal(existing.summary, "Manually named guest");
assert.equal(existing.guest_count, 5);
failRead = true;
await assert.rejects(sync(calendar, property, event, "uid"), /offline/);
assert.equal(writes, 2, "Failed reads must not be treated as missing bookings");

// Exercise read-receipt deduplication and failure recovery in the actual hook.
let receiptWrites = 0;
let counts = 0;
let failReceipt = false;
const previousDocument = globalThis.document;
globalThis.document = { visibilityState: "visible" };
try {
  const { useWhiteboardUnread: invokeHook } = load("../lib/use-whiteboard-unread.ts", {
    react: { useCallback: (fn) => fn, useMemo: (fn) => fn(), useState: (value) => [value, () => {}], useEffect: () => {} },
    "@/lib/supabase": { supabase: {
      rpc: async () => { counts++; return { data: 0, error: null }; },
      from: () => ({ upsert: async () => { receiptWrites++; return { error: failReceipt ? new Error("offline") : null }; } }),
    } },
  });
  const board = invokeHook("org", "user");
  await board.markSeen(["one", "one"]);
  await board.markSeen(["one"]);
  assert.equal(receiptWrites, 1);
  assert.equal(counts, 1);
  failReceipt = true;
  await board.markSeen(["two"]);
  failReceipt = false;
  await board.markSeen(["two"]);
  assert.equal(receiptWrites, 3, "Failed receipts remain retryable");
  await invokeHook("another-org", "another-user").markSeen(["one"]);
  assert.equal(receiptWrites, 4, "Acknowledgements must not cross identity boundaries");
} finally {
  globalThis.document = previousDocument;
}
// Exercise authenticated route boundaries and count heartbeat writes.
const rows = {
  profiles: [{ id: "admin", role: "platform_admin" }],
  organizations: [{ id: "org", name: "Organization", slug: "org" }],
  property_guest_devices: [{ id: "device", token_hash: "hashed", organization_id: "org", property_id: "property", revoked_at: null, last_seen_at: null }],
  properties: [{ id: "property", organization_id: "org" }],
  property_booking_events: [],
};
let updates = 0;
const tablesRead = [];
const routeService = {
  auth: { getUser: async () => ({ data: { user: { id: "admin" } }, error: null }) },
  from(table) {
    assert.ok(table in rows, `Unexpected broad query: ${table}`);
    tablesRead.push(table);
    const filters = [];
    let patch;
    let single = false;
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; },
      eq(key, value) { filters.push((row) => row[key] === value); return q; },
      gte(key, value) { filters.push((row) => row[key] >= value); return q; },
      or(value) {
        const cutoff = value.split("last_seen_at.lte.")[1];
        assert.ok(cutoff);
        filters.push((row) => row.last_seen_at == null || row.last_seen_at <= cutoff);
        return q;
      },
      update(value) { patch = value; return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        const matches = rows[table].filter((row) => filters.every((filter) => filter(row)));
        if (patch) matches.forEach((row) => { Object.assign(row, patch); updates++; });
        return { data: single ? matches[0] ?? null : matches, error: null };
      }).then(resolve, reject); },
    };
    return q;
  },
};
const routeModules = {
  "@supabase/supabase-js": { createClient: () => routeService },
  "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
  "@/lib/database-workload": workload,
  "@/lib/server/guest-device": { hashGuestDeviceToken: () => "hashed", getTodayYmd: () => "2026-09-10", pickRelevantBooking: () => ({ booking: null, stayStatus: "vacant" }) },
  "@/lib/server/audit-log": {},
};
const deviceGet = load("../app/api/device/guest-display/route.ts", routeModules).GET;
const deviceRequest = new Request("https://test.invalid/api/device/guest-display", { headers: { authorization: "Bearer device" } });
assert.equal((await deviceGet(deviceRequest)).status, 200);
assert.equal((await deviceGet(deviceRequest)).status, 200);
assert.equal(updates, 1, "Repeated device reads within five minutes write one heartbeat");
rows.property_guest_devices[0].revoked_at = new Date().toISOString();
const readsBeforeRevocation = tablesRead.length;
assert.equal((await deviceGet(deviceRequest)).status, 401);
assert.equal(tablesRead.length, readsBeforeRevocation + 1, "Revoked devices must not access property data");
assert.equal(updates, 1);
const selectorGet = load("../app/api/platform/organizations/route.ts", routeModules).GET;
const selectorRequest = { headers: new Headers({ authorization: "Bearer admin" }), nextUrl: new URL("https://test.invalid/api/platform/organizations?scope=selector") };
tablesRead.length = 0;
assert.equal((await selectorGet(selectorRequest)).status, 200);
assert.deepEqual(tablesRead, ["profiles", "organizations"]);
rows.profiles[0].role = "admin";
assert.equal((await selectorGet(selectorRequest)).status, 403, "Selector must retain platform-admin authorization");
console.log("Database workload regressions passed: refresh bursts, heartbeat writes/revocation, calendar changes/manual fields, receipt retries/isolation, and selector authorization/query count.");
