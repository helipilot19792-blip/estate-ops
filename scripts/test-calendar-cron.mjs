import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../app/api/cron/sync-calendars/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let calls = 0;
let result = { ok: true, calendars_found: 2, totals: { errors: 0 } };
let responseStatus = 200;
let fail = false;
const env = { CRON_SECRET: "test-secret" };
const exports = {};
new Function("exports", "require", "process", "console", code)(exports, (name) => {
  assert.equal(name, "@/app/api/sync-calendars/route");
  return { POST: async (request) => {
    calls++;
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("authorization"), "Bearer test-secret");
    assert.equal(new URL(request.url).origin, "https://app.example");
    if (fail) throw new Error("Database unavailable");
    return Response.json(result, { status: responseStatus });
  } };
}, { env }, { info() {}, error() {} });
const request = (token = "test-secret") => new Request("https://app.example/api/cron/sync-calendars", {
  headers: { authorization: `Bearer ${token}` },
});
assert.equal((await exports.GET(request("wrong"))).status, 401);
delete env.CRON_SECRET;
assert.equal((await exports.GET(request())).status, 401);
assert.equal(calls, 0, "Unauthorized requests must not invoke sync");
env.CRON_SECRET = "test-secret";
assert.equal((await exports.GET(request())).status, 200);
assert.equal(calls, 1);
result = { ok: true, totals: { errors: 1 }, results: [{ errors: ["Feed unavailable"] }] };
let response = await exports.GET(request());
assert.equal(response.status, 500, "Partial failures must fail the cron");
assert.equal((await response.json()).payload.results[0].errors[0], "Feed unavailable");
result = { ok: true, totals: { errors: 0 }, same_day_cleaner_conflicts: { errors: ["Notification failed"] } };
assert.equal((await exports.GET(request())).status, 500);
result = null;
assert.equal((await exports.GET(request())).status, 500);
responseStatus = 403;
result = { ok: false };
assert.equal((await exports.GET(request())).status, 403);
fail = true;
assert.equal((await exports.GET(request())).status, 500);
console.log("Calendar cron regression tests passed.");
