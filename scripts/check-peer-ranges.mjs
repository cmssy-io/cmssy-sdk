/**
 * Fails a release whose @cmssy peer ranges were not bumped with it.
 *
 * Every package here ships in lockstep at one version, so `"@cmssy/react":
 * "^11.3.0"` inside @cmssy/next@11.9.0 is a claim nobody checked. It stayed
 * there through six minors, and on a major it would admit an 11.x react into a
 * 12.x adapter - a combination npm installs without a word.
 *
 * Usage: node scripts/check-peer-ranges.mjs <version>
 */

import { readFileSync } from "node:fs";

const PACKAGES = [
  "core",
  "eslint-plugin",
  "codemod",
  "cli",
  "react",
  "next",
  "astro",
  "remix",
];

const version = process.argv[2];
if (!version) {
  console.error("usage: node scripts/check-peer-ranges.mjs <version>");
  process.exit(2);
}

const expected = `^${version}`;
const wrong = [];

for (const pkg of PACKAGES) {
  const manifest = JSON.parse(
    readFileSync(`packages/${pkg}/package.json`, "utf8"),
  );
  for (const [dep, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (!dep.startsWith("@cmssy/")) continue;
    if (range !== expected) wrong.push({ pkg, dep, range });
  }
}

if (wrong.length > 0) {
  for (const { pkg, dep, range } of wrong) {
    console.error(
      `::error::@cmssy/${pkg} peers ${dep} at ${range}, but this release is ${version} - expected ${expected}`,
    );
  }
  process.exit(1);
}

console.log(`every @cmssy peer range is ${expected}`);
