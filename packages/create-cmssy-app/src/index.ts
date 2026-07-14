#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(here, "..", "templates");

const FRAMEWORKS = ["next", "astro"] as const;
type Framework = (typeof FRAMEWORKS)[number];

function isFramework(value: string): value is Framework {
  return (FRAMEWORKS as readonly string[]).includes(value);
}

function parseFramework(args: string[]): Framework | null {
  const index = args.findIndex((a) => a === "--framework" || a === "-f");
  const value =
    index !== -1
      ? args[index + 1]
      : args.find((a) => a.startsWith("--framework="))?.split("=")[1];
  if (!value) return null;
  if (!isFramework(value)) {
    console.error(
      `Unknown framework "${value}". Available: ${FRAMEWORKS.join(", ")}`,
    );
    process.exit(1);
  }
  return value;
}

async function askFramework(): Promise<Framework> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (
    await rl.question(`Framework? (${FRAMEWORKS.join(" / ")}) [next] `)
  ).trim();
  rl.close();
  const value = answer || "next";
  if (!isFramework(value)) {
    console.error(`Unknown framework "${value}".`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const flagged = parseFramework(args);
  const name = args.find(
    (a, i) =>
      !a.startsWith("-") &&
      !isFramework(a) &&
      !(args[i - 1] === "--framework" || args[i - 1] === "-f"),
  );

  if (!name) {
    console.error(
      "Usage: npx create-cmssy-app <directory> [--framework next|astro]",
    );
    process.exit(1);
  }

  // Non-interactive (CI, a piped shell) must not hang on a prompt.
  const framework =
    flagged ?? (process.stdin.isTTY ? await askFramework() : "next");

  const target = resolve(process.cwd(), name);
  if (existsSync(target)) {
    console.error(`${name} already exists.`);
    process.exit(1);
  }

  await mkdir(target, { recursive: true });
  await cp(join(TEMPLATES, framework), target, { recursive: true });

  // npm refuses to publish a file called .gitignore inside a package, so the
  // template ships it under another name and it is restored here.
  const ignore = join(target, "gitignore");
  if (existsSync(ignore)) {
    await writeFile(join(target, ".gitignore"), await readFile(ignore, "utf8"));
    await rm(ignore);
  }

  const pkgPath = join(target, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { name: string };
  pkg.name = name.split("/").pop() as string;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const envFile = framework === "next" ? ".env.local" : ".env";

  console.log(`
Created ${name} (${framework}).

  1. cd ${name}
  2. cp .env.example ${envFile}     # Settings → Headless in the cmssy dashboard
  3. pnpm install && pnpm dev

The editor works out of the box, and \`pnpm smoke:edit\` proves it still does
after every change - the one path a build cannot check.
`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
