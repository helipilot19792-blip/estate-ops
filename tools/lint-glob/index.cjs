/* eslint-disable @typescript-eslint/no-require-imports -- Loaded by the Next.js ESLint plugin as CommonJS. */
const { isAbsolute } = require("node:path");
const { globSync: tinyGlobSync } = require("tinyglobby");

// The Next.js ESLint plugin only calls globSync to find root directories.
// Preserve fast-glob's absolute-pattern output and absence of trailing slashes.
exports.globSync = function globSync(patterns, options = {}) {
  const results = new Set();
  for (const pattern of Array.isArray(patterns) ? patterns : [patterns]) {
    const absolute = options.absolute ?? isAbsolute(pattern);
    for (const match of tinyGlobSync(pattern, { ...options, absolute })) {
      results.add(match.length > 1 ? match.replace(/\/$/, "") : match);
    }
  }
  return [...results];
};
