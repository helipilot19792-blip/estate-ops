import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { ensureInviteProfile } from "../lib/server/invite-profile.ts";
import { validatePassword } from "../lib/password-policy.ts";
import { createSupportEmailHandler } from "../supabase/functions/send-support-email/handler.ts";

// Execute the real route bodies with an in-memory Supabase boundary. No network
// or live accounts are used; assertions inspect resulting rows across tenants.
function loadRoute(path, service) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const modules = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@supabase/supabase-js": { createClient: () => service },
    "@/lib/server/audit-log": { writeAuditLog: async () => {} },
    "@/lib/server/invite-profile": { ensureInviteProfile },
    "@/lib/password-policy": { validatePassword },
  };
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public",
    SUPABASE_SERVICE_ROLE_KEY: "test-service",
  };
  new Function("exports", "require", "process", code)(exports, (name) => {
    assert.ok(modules[name], `Unexpected dependency ${name}`);
    return modules[name];
  }, { env });
  return exports.POST;
}

function database(rows, user = { id: "admin", email: "admin@example.test" }) {
  const service = {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      admin: {
        listUsers: async () => ({ data: { users: [{ id: "person", email: "a_b@example.test" }] }, error: null }),
        deleteUser: async () => assert.fail("Company removal must preserve shared logins"),
      },
    },
    from(table) {
      rows[table] ??= [];
      let action = "select", payload, options, single = false;
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        not(key, operator, value) {
          assert.equal(operator, "in");
          const values = value.slice(1, -1).split(",");
          filters.push(row => !values.includes(row[key])); return query;
        },
        update(value) { action = "update"; payload = value; return query; },
        upsert(value, config) { action = "upsert"; payload = value; options = config; return query; },
        delete() { action = "delete"; return query; },
        single() { single = true; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const selected = rows[table].filter(row => filters.every(filter => filter(row)));
            if (action === "delete") rows[table] = rows[table].filter(row => !selected.includes(row));
            if (action === "update") selected.forEach(row => Object.assign(row, payload));
            if (action === "upsert") {
              const existing = rows[table].find(row => row.id === payload.id);
              if (!existing) rows[table].push({ ...payload });
              else if (!options?.ignoreDuplicates) Object.assign(existing, payload);
            }
            return { data: single ? selected[0] ?? null : selected, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return service;
}

function fixture(role) {
  const accountKey = `${role}_account_id`;
  return {
    profiles: [{ id: "admin", role: "admin" }, { id: "person", role, email: "a_b@example.test" }],
    organization_members: [
      { profile_id: "admin", organization_id: "A", role: "admin" },
      { profile_id: "person", organization_id: "A", role },
      { profile_id: "person", organization_id: "B", role },
    ],
    [`${role}_accounts`]: [
      { id: "account-A", organization_id: "A", email: "a_b@example.test" },
      { id: "account-B", organization_id: "B", email: "a_b@example.test" },
      { id: "unrelated", organization_id: "A", email: "axb@example.test" },
    ],
    [`${role}_account_members`]: [
      { id: "member-A", [accountKey]: "account-A", profile_id: "person" },
      { id: "member-B", [accountKey]: "account-B", profile_id: "person" },
    ],
    [role === "cleaner" ? "turnover_job_slots" : "grounds_job_slots"]: [
      { id: "slot-A", [accountKey]: "account-A", accepted_by_profile_id: "person", declined_by_profile_id: "person" },
      { id: "slot-B", [accountKey]: "account-B", accepted_by_profile_id: "person", declined_by_profile_id: "person" },
    ],
  };
}
const request = (body, authenticated = true) => new Request("https://test.invalid/api", {
  method: "POST", headers: authenticated ? { authorization: "Bearer test-user" } : {},
  body: JSON.stringify(body),
});
for (const role of ["cleaner", "grounds"]) {
  const rows = fixture(role);
  const route = loadRoute("../app/api/admin/remove-team-member/route.ts", database(rows));
  const response = await route(request({ organizationId: "A", role, email: "a_b@example.test" }));
  assert.equal(response.status, 200);
  assert.deepEqual(rows[`${role}_account_members`].map(row => row.id), ["member-B"]);
  assert.deepEqual(rows[`${role}_accounts`].map(row => row.id), ["account-B", "unrelated"]);
  const slots = rows[role === "cleaner" ? "turnover_job_slots" : "grounds_job_slots"];
  assert.equal(slots[0].accepted_by_profile_id, null);
  assert.equal(slots[1].accepted_by_profile_id, "person");
  assert.equal(slots[1].declined_by_profile_id, "person");
  assert.ok(rows.organization_members.some(row => row.profile_id === "person" && row.organization_id === "B"));
  assert.ok(rows.profiles.some(row => row.id === "person"));

  const wildcardRows = fixture(role);
  const before = structuredClone(wildcardRows);
  const wildcardRoute = loadRoute("../app/api/admin/remove-team-member/route.ts", database(wildcardRows));
  assert.equal((await wildcardRoute(request({ organizationId: "A", role, email: "%" }))).status, 200);
  for (const table of Object.keys(before)) assert.deepEqual(wildcardRows[table], before[table]);

  const deniedRows = fixture(role);
  deniedRows.organization_members[0].role = "cleaner";
  const deniedRoute = loadRoute("../app/api/admin/remove-team-member/route.ts", database(deniedRows));
  assert.equal((await deniedRoute(request({ organizationId: "A", role, email: "a_b@example.test" }))).status, 403);
}

for (const role of ["admin", "platform_admin", "cleaner"]) {
  const rows = { profiles: [{ id: "person", role, full_name: "Original" }] };
  await ensureInviteProfile(database(rows), { id: "person", role: "grounds", full_name: "Replacement" });
  assert.equal(rows.profiles[0].role, role === "cleaner" ? "grounds" : role);
  assert.equal(rows.profiles[0].full_name, "Original");
}
const newProfiles = { profiles: [] };
await ensureInviteProfile(database(newProfiles), { id: "new", role: "cleaner" });
assert.equal(newProfiles.profiles[0].role, "cleaner");
const promoted = { profiles: [{ id: "person", role: "cleaner" }] };
await ensureInviteProfile(database(promoted), { id: "person", role: "admin" });
assert.equal(promoted.profiles[0].role, "admin");

const inviteRows = {
  profiles: [{ id: "person", role: "admin" }],
  organization_invites: [{ id: "invite", token: "secret", email: "a_b@example.test", role: "cleaner", status: "sent" }],
};
const inviteBefore = structuredClone(inviteRows);
const createAccount = loadRoute("../app/api/invite/create-account/route.ts", database(inviteRows));
const existingResponse = await createAccount(request({ token: "secret", password: "long-password" }, false));
assert.equal(existingResponse.status, 200);
assert.equal((await existingResponse.json()).accountAlreadyExisted, true);
assert.deepEqual(inviteRows, inviteBefore, "Existing accounts cannot be modified by an unauthenticated invitation");

async function supportScenario({ authenticated = true, authStatus = 200, quota = 0, quotaStatus = 200, body } = {}) {
  const calls = [];
  const handler = createSupportEmailHandler({
    env: key => ({ SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "service", RESEND_API_KEY: "resend" })[key],
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "person", email: "verified@example.test", email_confirmed_at: "2026-09-08" }, { status: authStatus });
      if (url.includes("/rpc/")) return Response.json(quota, { status: quotaStatus });
      assert.equal(url, "https://api.resend.com/emails");
      return Response.json({ id: "sent" });
    },
  });
  const response = await handler(request(body ?? { subject: "<b>Help</b>", message: '<img src="x">', userEmail: "spoof@example.test" }, authenticated));
  return { response, calls };
}
const anonymous = await supportScenario({ authenticated: false });
assert.equal(anonymous.response.status, 401);
assert.equal(anonymous.calls.length, 0);
const invalid = await supportScenario({ authStatus: 401 });
assert.equal(invalid.response.status, 401);
assert.equal(invalid.calls.length, 1);
const limited = await supportScenario({ quota: 60 });
assert.equal(limited.response.status, 429);
assert.equal(limited.response.headers.get("Retry-After"), "60");
assert.equal(limited.calls.length, 2);
const unavailable = await supportScenario({ quotaStatus: 503 });
assert.equal(unavailable.response.status, 503);
assert.equal(unavailable.calls.length, 2);
const malformedQuota = await supportScenario({ quota: null });
assert.equal(malformedQuota.response.status, 503);
const oversized = await supportScenario({ body: { message: "x".repeat(10001) } });
assert.equal(oversized.response.status, 400);
const success = await supportScenario();
assert.equal(success.response.status, 200);
const sent = JSON.parse(success.calls[2].options.body);
assert.equal(sent.reply_to, "verified@example.test");
assert.ok(sent.html.includes("&lt;img"));
assert.ok(sent.html.includes("&lt;b&gt;Help&lt;/b&gt;"));
assert.ok(!sent.html.includes("spoof@example.test"));
assert.deepEqual(JSON.parse(success.calls[1].options.body), { p_user_id: "person" });
console.log("Security boundary tests passed (tenant isolation, literal emails, invitation roles/authentication, and support email protections).");
