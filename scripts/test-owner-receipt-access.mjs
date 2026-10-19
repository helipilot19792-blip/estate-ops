import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(path, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", ...Object.keys(globals), code)(exports, (name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, ...Object.values(globals));
  return exports;
}
const reference = load("../lib/storage-reference.ts");
const receipt = load("../lib/receipt-asset-url.ts", { "./storage-reference": reference });
const invoiceId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const savedReceipt = `https://project.supabase.co/storage/v1/object/sign/invoice-assets/${organizationId}/pest%20control.pdf?token=expired`;
function fixture() {
  return {
    user: { id: "owner-profile", email: "owner@example.test" },
    owner_accounts: [{ id: "owner", organization_id: organizationId, email: "owner@example.test", is_active: true }],
    owner_invoices: [{ id: invoiceId, organization_id: organizationId, owner_account_id: "owner", status: "paid", line_items: [{ receipt_urls: [savedReceipt] }] }],
    signs: [], serviceClients: 0,
  };
}
function handler(rows) {
  const ownerClient = {
    auth: { async getUser() { return { data: { user: rows.user }, error: rows.authError || null }; } },
    from(table) {
      const filters = [];
      const q = {
        select() { return q; },
        eq(key, value) { filters.push((row) => row[key] === value); return q; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return q; },
        async maybeSingle() {
          if (rows.queryError) return { data: null, error: { message: "private diagnostic" } };
          return { data: rows[table].find((row) => filters.every((filter) => filter(row))) || null, error: null };
        },
      };
      return q;
    },
    // Production owners are denied direct storage signing. The endpoint must not use it.
    storage: { from() { assert.fail("Owner storage signing must not be required"); } },
  };
  return load("../app/api/owner/invoice-receipt/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@supabase/supabase-js": { createClient(url, key) {
      if (key === "public-key") return ownerClient;
      assert.equal(key, "service-key");
      rows.serviceClients++;
      return { storage: { from(bucket) { return { async createSignedUrl(path, lifetime) {
        rows.signs.push({ bucket, path, lifetime });
        return rows.signError ? { data: null, error: { message: "private storage failure" } }
          : { data: { signedUrl: "https://storage.example/receipt.pdf?token=fresh" }, error: null };
      } }; } } };
    } },
    "@/lib/storage-reference": reference,
    "@/lib/receipt-asset-url": receipt,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key", SUPABASE_SERVICE_ROLE_KEY: "service-key" } } }).POST;
}
const body = { invoiceId, lineItemIndex: 0, receiptIndex: 0 };
function request(payload = body, authenticated = true) {
  return new Request("https://portal.example/api/owner/invoice-receipt", {
    method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: "Bearer owner-session" } : {}) },
    body: JSON.stringify(payload),
  });
}
const valid = fixture();
const response = await handler(valid)(request());
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "private, no-store");
assert.deepEqual(await response.json(), { url: "https://storage.example/receipt.pdf?token=fresh" });
assert.deepEqual(valid.signs, [{ bucket: "invoice-assets", path: `${organizationId}/pest control.pdf`, lifetime: 3600 }]);

async function denied(change, status, payload = body, authenticated = true) {
  const rows = fixture(); change(rows);
  const result = await handler(rows)(request(payload, authenticated));
  assert.equal(result.status, status);
  assert.equal(rows.signs.length, 0, "Unauthorized or invalid input must never reach storage signing");
  assert.equal(rows.serviceClients, 0, "Privileged client must be created only after invoice ownership and path checks");
  assert.ok(!JSON.stringify(await result.json()).includes("private diagnostic"));
}
await denied(() => {}, 401, body, false);
await denied((r) => { r.user = null; }, 401);
await denied((r) => { r.authError = { message: "expired" }; }, 401);
await denied((r) => { r.user.email = "different-owner@example.test"; }, 404);
await denied((r) => { r.owner_accounts[0].is_active = false; }, 404);
await denied((r) => { r.owner_accounts[0].organization_id = "another-company"; }, 404);
await denied((r) => { r.owner_invoices[0].owner_account_id = "another-owner"; }, 404);
await denied((r) => { r.owner_invoices[0].status = "draft"; }, 404);
await denied((r) => { r.owner_invoices[0].status = "void"; }, 404);
await denied((r) => { r.queryError = true; }, 500);
await denied(() => {}, 400, { ...body, invoiceId: "malformed" });
await denied(() => {}, 400, { ...body, receiptIndex: -1 });
await denied(() => {}, 400, { ...body, lineItemIndex: "0" });
await denied(() => {}, 404, { ...body, lineItemIndex: 2 });
await denied(() => {}, 404, { ...body, receiptIndex: 9 });
await denied((r) => { r.owner_invoices[0].line_items[0].receipt_urls[0] = "storage://invoice-assets/another-company/secret.pdf"; }, 404);
await denied((r) => { r.owner_invoices[0].line_items[0].receipt_urls[0] = `storage://document-vault/${organizationId}/secret.pdf`; }, 404);
for (const path of [`${organizationId}/../another-company/secret.pdf`, `${organizationId}/%252e%252e/another-company/secret.pdf`, `${organizationId}\\..\\another-company/secret.pdf`]) {
  await denied((r) => { r.owner_invoices[0].line_items[0].receipt_urls[0] = `storage://invoice-assets/${path}`; }, 404);
}
const forged = fixture();
assert.equal((await handler(forged)(request({ ...body, url: "storage://invoice-assets/another-company/secret.pdf" }))).status, 200);
assert.equal(forged.signs[0].path, `${organizationId}/pest control.pdf`, "Only the receipt actually stored on the authorized invoice may be signed");
const unavailable = fixture(); unavailable.signError = true;
const failed = await handler(unavailable)(request());
assert.equal(failed.status, 502);
assert.ok(!JSON.stringify(await failed.json()).includes("private storage failure"));

// Owner browser uses its verified session to call the invoice-scoped endpoint.
let posted;
const client = { auth: { async getSession() { return { data: { session: { access_token: "owner-session" } } }; } } };
const browser = load("../lib/owner-receipt-url.ts", {}, { fetch: async (url, options) => {
  posted = { url, options };
  return Response.json({ url: "https://storage.example/fresh.pdf" });
} });
assert.equal(await browser.getOwnerReceiptUrl(client, invoiceId, 0, 0), "https://storage.example/fresh.pdf");
assert.equal(posted.url, "/api/owner/invoice-receipt");
assert.equal(posted.options.headers.Authorization, "Bearer owner-session");
assert.deepEqual(JSON.parse(posted.options.body), body);
assert.equal(posted.options.cache, "no-store");
await assert.rejects(browser.getOwnerReceiptUrl({ auth: { getSession: async () => ({ data: { session: null } }) } }, invoiceId, 0, 0), /sign in again/);
const signedOut = load("../lib/owner-receipt-url.ts", {}, { fetch: async () => Response.json({ error: "Please sign in again to open this receipt." }, { status: 401 }) });
await assert.rejects(signedOut.getOwnerReceiptUrl(client, invoiceId, 0, 0), /sign in again/);
const ownerSource = readFileSync(new URL("../components/owner/ownerportal.tsx", import.meta.url), "utf8");
assert.ok(ownerSource.includes("resolveUrl={() => getOwnerReceiptUrl(supabase, invoice.id, index, receiptIndex)}"));
console.log("Owner receipt access regression tests passed: valid owner, direct storage denied, cross-owner/company, inactive account, draft/void, forged path, session errors.");
