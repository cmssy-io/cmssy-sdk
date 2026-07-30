import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BIN = join(ROOT, "node_modules/.bin");

const packages = readdirSync(join(ROOT, "packages")).filter((name) => {
  const pkg = JSON.parse(
    readFileSync(join(ROOT, "packages", name, "package.json"), "utf8"),
  );
  return pkg.private !== true;
});

const failed = [];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  return result.status === 0;
}

for (const name of packages) {
  const dir = join(ROOT, "packages", name);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

  console.log(`\n=== ${pkg.name} ===\n`);

  if (!run(join(BIN, "publint"), ["--strict", dir], ROOT)) {
    failed.push(`${pkg.name}: publint`);
  }

  if (!pkg.exports) {
    console.log("no exports map - skipping the types resolution check");
    continue;
  }

  if (!run(join(BIN, "attw"), ["--pack", "--profile", "node16", "."], dir)) {
    failed.push(`${pkg.name}: attw`);
  }
}

if (failed.length > 0) {
  console.error(
    `\nWhat a consumer installs is wrong in ${failed.length} place(s):\n  ${failed.join("\n  ")}\n`,
  );
  process.exit(1);
}

console.log(
  `\n${packages.length} packages: publishable shape and types resolve.\n`,
);
