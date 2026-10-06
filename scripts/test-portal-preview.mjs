import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Run production handlers and loaders against a two-organization database.
// Deliberately inconsistent foreign references must also stay out of previews.
function fixture() {
  return {
    profiles: [{ id: "admin", role: "admin", email: "admin@test.invalid" }, { id: "member", role: "cleaner" }],
    organization_members: [{ organization_id: "a", profile_id: "admin", role: "admin" }],
    cleaner_accounts: [{ id: "cleaner-a", organization_id: "a", display_name: "Cleaner A" }, { id: "cleaner-b", organization_id: "b", display_name: "Cleaner B" }],
    cleaner_account_members: [{ cleaner_account_id: "cleaner-a", profile_id: "shared-login" }, { cleaner_account_id: "cleaner-b", profile_id: "shared-login" }],
    owner_accounts: [{ id: "owner-a", organization_id: "a", full_name: "Owner A" }, { id: "owner-b", organization_id: "b", full_name: "Owner B" }],
    owner_property_access: [{ owner_account_id: "owner-a", property_id: "property-a" }, { owner_account_id: "owner-a", property_id: "property-b" }],
    properties: [{ id: "property-a", organization_id: "a" }, { id: "property-b", organization_id: "b" }],
    turnover_jobs: [{ id: "job-a", organization_id: "a", property_id: "property-a" }, { id: "job-b", organization_id: "b", property_id: "property-b" }, { id: "bad-job", organization_id: "a", property_id: "property-b" }],
    turnover_job_slots: [{ id: "slot-a", job_id: "job-a", cleaner_account_id: "cleaner-a", status: "accepted" }, { id: "slot-b", job_id: "job-b", cleaner_account_id: "cleaner-b" }, { id: "bad-slot", job_id: "bad-job", cleaner_account_id: "cleaner-a" }],
    property_access: [{ property_id: "property-a", door_code: "A" }, { property_id: "property-b", door_code: "B" }],
    property_sops: [{ id: "sop-a", property_id: "property-a" }, { id: "sop-b", property_id: "property-b" }],
    property_sop_images: [{ sop_id: "sop-a", image_url: "a" }, { sop_id: "sop-b", image_url: "b" }],
    turnover_job_checklist_items: [],
    property_cleaning_checklist_items: [{ id: "template-a", property_id: "property-a", active: true, title: "Clean A" }, { id: "template-b", property_id: "property-b", active: true, title: "Clean B" }],
    organizations: [{ id: "a", name: "Organization A" }, { id: "b", name: "Organization B" }],
    owner_invoices: [{ id: "invoice-a", organization_id: "a", owner_account_id: "owner-a", property_id: "property-a", status: "sent" }, { id: "invoice-b", organization_id: "b", owner_account_id: "owner-a", property_id: "property-b", status: "sent" }, { id: "bad-invoice", organization_id: "a", owner_account_id: "owner-a", property_id: "property-b", status: "sent" }],
    property_maintenance_flags: [{ id: "flag-a", property_id: "property-a", source: "owner" }, { id: "flag-b", property_id: "property-b", source: "owner" }],
    property_maintenance_flag_images: [{ flag_id: "flag-a", image_url: "a" }, { flag_id: "flag-b", image_url: "b" }],
  };
}

function harness(rows = fixture()) {
  let user = { id: "admin" };
  let failAudit = false;
  const writes = [];
  const service = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table) {
      let single = false, payload;
      const filters = [];
      const query = {
        select() { return query; }, order() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        gte() { return query; }, lte() { return query; },
        or() { return query; },
        maybeSingle() { single = true; return query; },
        insert(value) { payload = value; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (payload) {
              writes.push({ table, payload });
              if (table === "audit_logs" && failAudit) return { data: null, error: { code: "PGRST205", message: "Missing audit_logs" } };
            }
            const selected = (rows[table] ?? []).filter(row => filters.every(filter => filter(row)));
            return { data: single ? selected[0] ?? null : selected, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const modules = {
    "server-only": {},
    "@supabase/supabase-js": { createClient: () => service },
    "@/lib/server/storage-assets": { createSignedStorageAssetUrl: async (_, url) => url },
  };
  function load(path) {
    const exports = {};
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("exports", "require", "process", code)(exports, name => {
      if (name in modules) return modules[name];
      assert.ok(name.startsWith("@/lib/server/"), `Unexpected import: ${name}`);
      return modules[name] = load(`${name.slice(2)}.ts`);
    }, { env: { NEXT_PUBLIC_SUPABASE_URL: "https://test.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public", SUPABASE_SERVICE_ROLE_KEY: "service" } });
    return exports;
  }
  return { route: load("app/api/admin/portal-preview/route.ts"), rows, writes, setUser: value => { user = value; }, failAudit: () => { failAudit = true; } };
}

const get = (organizationId = "a") => new Request(`https://test.invalid/api/admin/portal-preview?organizationId=${organizationId}`, { headers: { Authorization: "Bearer token" } });
const post = (portal = "cleaner", accountId = "cleaner-a", organizationId = "a") => new Request("https://test.invalid/api/admin/portal-preview", {
  method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" }, body: JSON.stringify({ portal, accountId, organizationId }),
});

let h = harness();
let response = await h.route.GET(get());
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "private, no-store");
assert.deepEqual((await response.json()).accounts.map(row => row.id), ["cleaner-a", "owner-a"]);
assert.equal((await h.route.GET(get("b"))).status, 403);
assert.equal((await h.route.POST(post("cleaner", "cleaner-b"))).status, 404);
assert.equal((await h.route.POST(post("owner", "owner-b"))).status, 404);
assert.equal(h.writes.length, 0, "Rejected previews never write or audit a successful preview");

response = await h.route.POST(post());
assert.equal(response.status, 200);
let result = await response.json();
assert.equal(result.dashboard.account.id, "cleaner-a");
assert.deepEqual(result.dashboard.jobs.map(row => row.job.id), ["job-a"]);
assert.deepEqual(result.dashboard.properties.map(row => row.id), ["property-a"]);
assert.deepEqual(result.dashboard.accessRows.map(row => row.door_code), ["A"]);
assert.deepEqual(result.dashboard.sopImages.map(row => row.image_url), ["a"]);
assert.equal(result.dashboard.checklistItems[0].title, "Clean A", "Uninitialized checklists render without inserting rows");
assert.deepEqual(h.writes.map(row => row.table), ["audit_logs"]);
assert.equal(h.writes[0].payload.actor_profile_id, "admin");
assert.equal(h.writes[0].payload.organization_id, "a");
assert.equal(h.writes[0].payload.target_id, "cleaner-a");
assert.equal(h.writes[0].payload.metadata.read_only, true);

response = await h.route.POST(post("owner", "owner-a"));
assert.equal(response.status, 200);
result = await response.json();
assert.deepEqual(result.dashboard.properties.map(row => row.id), ["property-a"]);
assert.deepEqual(result.dashboard.ownerInvoices.map(row => row.id), ["invoice-a"]);
assert.deepEqual(result.dashboard.flags.map(row => row.id), ["flag-a"]);
assert.deepEqual(result.dashboard.flagImages.map(row => row.image_url), ["a"]);
assert.ok(h.writes.every(row => row.table === "audit_logs"), "Previewing never changes portal data or read receipts");

for (const role of ["cleaner", "owner", "pending"]) {
  h = harness(); h.rows.profiles[0].role = role;
  assert.equal((await h.route.GET(get())).status, 403);
  assert.equal((await h.route.POST(post())).status, 403);
  assert.equal(h.writes.length, 0);
}
h = harness(); h.rows.profiles[0].role = "platform_admin";
assert.equal((await h.route.POST(post("cleaner", "cleaner-b", "b"))).status, 403, "Platform admins must also belong to the selected organization");
h = harness(); h.rows.organization_members[0].role = "cleaner";
assert.equal((await h.route.POST(post())).status, 403);
h = harness(); h.setUser(null);
assert.equal((await h.route.POST(post())).status, 401);
assert.equal((await h.route.GET(get())).status, 401);
h = harness();
assert.equal((await h.route.POST(post("admin"))).status, 400);
assert.equal((await h.route.POST(post("cleaner", ""))).status, 400);
assert.equal((await h.route.POST(new Request("https://test.invalid", { method: "POST" }))).status, 401);
h.failAudit();
assert.equal((await h.route.POST(post())).status, 500, "A preview must fail closed when it cannot be audited");

// Execute real UI write handlers with preview enabled. Any attempted side effect
// fails the test, including sign-out or API calls using the retained admin token.
function runGuardedHandlers(path, names, previewValue) {
  const source = ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) found.set(node.name.text, node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  return Promise.all(names.map(async name => {
    assert.ok(found.has(name), `Missing production handler: ${name}`);
    const code = ts.transpileModule(`${found.get(name)}\nexport { ${name} };`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {};
    new Function("exports", "preview", code)(exports, previewValue);
    // Arguments need not be valid: the read-only guard must run first.
    await exports[name]();
  }));
}
await runGuardedHandlers("components/cleaner/cleanershell.tsx", ["performCleanerRefresh", "handleAcceptJob", "handleDeclineJob", "handleProgressAction", "handleToggleChecklistItem", "handleReleaseJob", "handleSignOut", "handleSwitchToGrounds"], {});
await runGuardedHandlers("components/owner/ownerportal.tsx", ["signOutOwner", "downloadOwnerInvoicePdf", "hideOwnerInvoice"], {});
console.log("Portal preview: organization isolation, account boundaries, read-only loaders, audit requirements, and UI write guards passed.");
