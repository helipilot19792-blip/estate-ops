import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isGuleraOsV2Enabled } from "../lib/server/admin-v2/feature.ts";

assert.equal(isGuleraOsV2Enabled(undefined), false);
assert.equal(isGuleraOsV2Enabled(""), false);
assert.equal(isGuleraOsV2Enabled("false"), false);
assert.equal(isGuleraOsV2Enabled("0"), false);
assert.equal(isGuleraOsV2Enabled("true"), true);
assert.equal(isGuleraOsV2Enabled(" TRUE "), true);
assert.equal(isGuleraOsV2Enabled("1"), true);

const [classicPage, v2Page, v2Route, v2Shell, featureSource] = await Promise.all([
  readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/admin-v2/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin-v2/access/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/admin-v2/admin-v2-shell.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/server/admin-v2/feature.ts", import.meta.url), "utf8"),
]);

assert.equal(
  classicPage.includes("admin-v2"),
  false,
  "Classic admin must not import or depend on V2."
);
assert.equal(
  v2Page.includes("admin-workspace"),
  false,
  "V2 must not import the Classic admin workspace."
);
assert.equal(
  featureSource.includes("NEXT_PUBLIC_GULERA_OS_V2_ENABLED"),
  false,
  "The V2 flag must remain server-only."
);
assert.equal(
  featureSource.includes("GULERA_OS_V2_ENABLED"),
  true,
  "The server-only V2 flag must be present."
);
assert.equal(
  v2Route.includes("export async function POST"),
  false,
  "The first V2 API must remain read-only."
);
assert.equal(
  v2Shell.includes('href="/admin"'),
  true,
  "V2 must always provide a Classic Gulera escape link."
);

console.log("Admin V2 flag, route isolation, read-only API, and Classic escape checks passed.");
