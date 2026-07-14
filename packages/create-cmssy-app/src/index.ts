#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(here, "..", "template");

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("Usage: npx create-cmssy-app <directory>");
    process.exit(1);
  }

  const target = resolve(process.cwd(), name);
  if (existsSync(target)) {
    console.error(`${name} already exists.`);
    process.exit(1);
  }

  await mkdir(target, { recursive: true });
  await cp(TEMPLATE, target, { recursive: true });

  // npm refuses to publish a file called .gitignore inside a package, so the
  // template ships it under another name and it is restored here.
  const ignore = join(target, "gitignore");
  if (existsSync(ignore)) {
    await writeFile(join(target, ".gitignore"), await readFile(ignore, "utf8"));
    await rm(ignore);
  }

  const pkgPath = join(target, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  pkg.name = name.split("/").pop();
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  console.log(`
Created ${name}.

  1. cd ${name}
  2. cp .env.example .env.local     # Settings → Headless in the cmssy dashboard
  3. pnpm install && pnpm dev

The editor works out of the box, and \`pnpm smoke:edit\` proves it still does
after every change - the one path a build cannot check.
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
