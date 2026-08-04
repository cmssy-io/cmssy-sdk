/**
 * Fails a release whose @cmssy peer ranges were not bumped with it.
 *
 * Every package here ships in lockstep at one version, so `"@cmssy/react":
 * "^11.3.0"` inside @cmssy/next@11.9.0 is a claim nobody checked. It stayed
 * there through six minors, and on a major it would admit an 11.x react into a
 * 12.x adapter - a combination npm installs without a word.
 *
 * The version comes from the packages themselves, not the tag, so a
 * workflow_dispatch publish is held to the same rule as a tagged one. That
 * path skips the tag-matches-version check, so this also refuses to run
 * against packages that are not all on one version - otherwise a skew would
 * publish as long as the peer ranges happened to match core.
 *
 * Passing a version explicitly asks "would this release pass?" and skips the
 * lockstep check, since the point is to compare against a version nothing is
 * on yet.
 *
 * Usage: node scripts/check-peer-ranges.mjs [version]
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packagesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
);

function manifestOf(pkg) {
  return JSON.parse(
    readFileSync(join(packagesDir, pkg, "package.json"), "utf8"),
  );
}

const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => {
    try {
      manifestOf(name);
      return true;
    } catch {
      return false;
    }
  })
  .sort();

if (packages.length === 0) {
  console.error("::error::found no packages to check - is packages/ missing?");
  process.exit(2);
}

const asked = process.argv[2];

if (!asked) {
  const skew = packages
    .map((pkg) => ({ pkg, version: manifestOf(pkg).version }))
    .filter((p) => p.version !== manifestOf("core").version);
  if (skew.length > 0) {
    for (const { pkg, version } of skew) {
      console.error(
        `::error::@cmssy/${pkg} is ${version} but @cmssy/core is ${manifestOf("core").version} - these ship in lockstep`,
      );
    }
    process.exit(1);
  }
}

const version = asked ?? manifestOf("core").version;
const expected = `^${version}`;
const wrong = [];

for (const pkg of packages) {
  const manifest = manifestOf(pkg);
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

console.log(
  `every @cmssy peer range is ${expected} (${packages.length} packages)`,
);
