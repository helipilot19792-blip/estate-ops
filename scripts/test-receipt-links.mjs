import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(path, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("exports", "require", ...Object.keys(globals), code)(exports, (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, ...Object.values(globals));
  return exports;
}
const reference = load("../lib/storage-reference.ts");
const receipt = load("../lib/receipt-asset-url.ts", { "./storage-reference": reference });
const calls = [];
let fail = false;
const storage = { from(bucket) { return { async createSignedUrl(path, lifetime) {
  calls.push({ bucket, path, lifetime });
  return fail ? { data: null, error: { message: "denied" } }
    : { data: { signedUrl: `https://storage.example/receipt?token=fresh-${calls.length}` }, error: null };
} }; } };
const expired = "https://project.supabase.co/storage/v1/object/sign/invoice-assets/org/receipt%20one.pdf?token=expired";
assert.match(await receipt.getFreshReceiptUrl(storage, expired), /fresh-1$/);
assert.match(await receipt.getFreshReceiptUrl(storage, expired), /fresh-2$/);
assert.deepEqual(calls[0], { bucket: "invoice-assets", path: "org/receipt one.pdf", lifetime: 3600 });
assert.match(await receipt.getFreshReceiptUrl(storage, "storage://invoice-assets/org/receipt.pdf"), /fresh-3$/);
fail = true;
await assert.rejects(receipt.getFreshReceiptUrl(storage, expired), /Could not open/);
assert.equal(await receipt.getFreshReceiptUrl(storage, "https://example.com/receipt.pdf"), "https://example.com/receipt.pdf");
await assert.rejects(receipt.getFreshReceiptUrl(storage, "javascript:alert(1)"), /Unsupported/);

// Exercise the actual click handler, including tab creation before asynchronous signing.
let signing = false;
let popupBlocked = false;
const tabs = [];
const states = [];
const component = load("../components/receipt-link.tsx", {
  react: { useRef: (value) => ({ current: value }), useState: (value) => [value, (next) => states.push(next)] },
  "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "fragment" },
  "@/lib/receipt-asset-url": { async getFreshReceiptUrl(client, value) {
    assert.ok(tabs.length > 0, "tab must open during the click before signing starts");
    signing = true;
    return receipt.getFreshReceiptUrl(client, value);
  } },
}, { window: { open() {
  if (popupBlocked) return null;
  assert.equal(signing, false);
  const tab = { opener: "parent", closed: false, location: { replace(url) { tab.url = url; } }, close() { tab.closed = true; } };
  tabs.push(tab);
  return tab;
} } });
function click(overrides = {}) {
  signing = false;
  const tree = component.ReceiptLink({ storage, value: expired, children: "Receipt", ...overrides });
  tree.props.children[0].props.onClick();
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
fail = false;
click();
await settle();
assert.equal(tabs[0].opener, null);
assert.match(tabs[0].url, /token=fresh-/);
fail = true;
click();
await settle();
assert.equal(tabs[1].closed, true);
assert.equal(tabs[1].url, undefined, "failed signing must never navigate to the expired saved link");
assert.ok(states.some((value) => typeof value === "string" && value.includes("Could not open")));
popupBlocked = true;
click();
await settle();
assert.ok(states.some((value) => typeof value === "string" && value.includes("Allow pop-ups")));
popupBlocked = false;
fail = true;
const callsBeforeOwnerOpen = calls.length;
click({ resolveUrl: async () => "https://storage.example/owner-authorized.pdf" });
await settle();
assert.equal(tabs.at(-1).url, "https://storage.example/owner-authorized.pdf");
assert.equal(calls.length, callsBeforeOwnerOpen, "Owner receipts must use the invoice resolver even when direct storage signing is denied");
click({ resolveUrl: async () => { throw new Error("Please sign in again to open this receipt."); } });
await settle();
assert.ok(states.includes("Please sign in again to open this receipt."));
console.log("Receipt link regression tests passed (offline).");
