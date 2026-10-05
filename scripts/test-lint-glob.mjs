import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { getRootDirs } = require("@next/eslint-plugin-next/dist/utils/get-root-dirs.js");
const fixtureParent = process.cwd();
const fixture = mkdtempSync(join(fixtureParent, ".lint-glob-fixture-"));
const normalize = (path) => path.replaceAll("\\", "/");
const root = normalize(fixture);

try {
  for (const directory of ["apps/admin", "apps/owner", "packages/one", "packages/two"]) {
    mkdirSync(join(fixture, directory), { recursive: true });
  }
  assert.deepEqual(getRootDirs({ cwd: fixture, settings: {} }), [fixture]);
  assert.deepEqual(getRootDirs({ cwd: fixture, settings: { next: { rootDir: `${root}/apps/*` } } }).sort(),
    [`${root}/apps/admin`, `${root}/apps/owner`]);
  assert.deepEqual(getRootDirs({ cwd: fixture, settings: { next: { rootDir: [
    `${root}/apps/*`, `${root}/packages/{one,two}`,
  ] } } }).sort(), [
    `${root}/apps/admin`, `${root}/apps/owner`, `${root}/packages/one`, `${root}/packages/two`,
  ]);
  assert.deepEqual(getRootDirs({ cwd: fixture, settings: { next: { rootDir: `${root}/missing/*` } } }), []);
  console.log("Next.js lint glob compatibility checks passed");
} finally {
  const resolvedFixture = resolve(fixture);
  const expectedPrefix = join(resolve(fixtureParent), ".lint-glob-fixture-");
  if (!resolvedFixture.startsWith(expectedPrefix)) throw new Error("Unexpected fixture path");
  rmSync(resolvedFixture, { recursive: true, force: true });
}
