import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  GULERA_EXPERIENCE_KEY,
  getPreferredAdminDestination,
  parseGuleraExperience,
} from "../lib/gulera-experience.ts";

assert.equal(GULERA_EXPERIENCE_KEY, "gulera-os-experience");
assert.equal(parseGuleraExperience("classic"), "classic");
assert.equal(parseGuleraExperience("v2"), "v2");
assert.equal(parseGuleraExperience("admin"), null);
assert.equal(parseGuleraExperience(null), null);
assert.equal(getPreferredAdminDestination(), "/choose-experience");

const [
  chooserPage,
  chooser,
  login,
  classicWorkspace,
  v2Shell,
  experiencePreference,
] = await Promise.all([
  readFile(new URL("../app/choose-experience/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/experience/experience-chooser.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/admin/admin-workspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/admin-v2/admin-v2-shell.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/gulera-experience.ts", import.meta.url), "utf8"),
]);

assert(chooserPage.includes("isGuleraOsV2Enabled"), "The chooser must use the server-only feature flag.");
assert(chooserPage.includes('redirect("/admin")'), "A disabled chooser must return to Classic.");
assert(chooser.includes('fetch("/api/admin-v2/access"'), "The chooser must verify existing admin access.");
assert(chooser.includes('rememberGuleraExperience(experience)'), "The chooser must save only the browser preference.");
assert(chooser.includes("Read-only—no actions performed"), "The preview choice must state its read-only boundary.");
assert(login.includes("getPreferredAdminDestination"), "Admin login must honor the reversible browser preference.");
assert(classicWorkspace.includes('fetch("/api/admin-v2/access"'), "Classic must verify availability before showing the chooser control.");
assert(classicWorkspace.includes("V2 is optional. Classic must remain fully usable"), "Classic must fail open when V2 is unavailable.");
assert(v2Shell.includes('rememberGuleraExperience("classic")'), "The V2 escape must persist the Classic choice.");
assert(experiencePreference.includes("localStorage"), "The preference must remain browser-only.");

for (const source of [chooserPage, chooser, experiencePreference]) {
  for (const mutation of [".insert(", ".update(", ".upsert(", ".delete(", "export async function POST"]) {
    assert.equal(source.includes(mutation), false, `Phase 4 must not mutate operational data (${mutation}).`);
  }
}

console.log("Admin V2 experience chooser, browser preference, access gate, and Classic escape checks passed.");
