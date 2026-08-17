import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [demoPage, loginPage] = await Promise.all([
  readFile(new URL("../app/demo/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
]);

assert.match(demoPage, /Harbour House/, "the demo should identify its fictional property");
assert.match(demoPage, /Fictional data/, "the demo should clearly label fictional data");
assert.match(demoPage, /Read-only/, "the demo should clearly label the simulated workspace read-only");
assert.match(loginPage, /href="\/demo"/, "the login screen should link to the demo");
assert.match(demoPage, /href="\/login"/, "the demo should provide a route back to login");

for (const forbidden of [
  /@\/lib\/supabase/,
  /createClient\s*\(/,
  /fetch\s*\(/,
  /SUPABASE_/,
  /<form\b/,
  /type="password"/,
]) {
  assert.doesNotMatch(
    demoPage,
    forbidden,
    `the public demo must remain isolated from authentication and persistence (${forbidden})`,
  );
}

console.log("Demo isolation checks passed.");
