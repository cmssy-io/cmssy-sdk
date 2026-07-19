import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PreflightResult } from "@cmssy/core/preflight";

import { CliError } from "./admin-client";
import { formatResult } from "./format";
import {
  detectFramework,
  nextSrcPrefix,
  readPackageJson,
  type FrameworkDef,
  type PackageManifest,
} from "./framework";

const ASSETS_DIR = fileURLToPath(new URL("../assets/init", import.meta.url));
const CLI_PACKAGE_JSON = fileURLToPath(
  new URL("../package.json", import.meta.url),
);

export interface InitOptions {
  dir?: string;
  force?: boolean;
}

export interface InitDeps {
  cwd: string;
  log: (line: string) => void;
}

interface InitFile {
  asset: string;
  target: string;
}

function frameworkFiles(framework: FrameworkDef, root: string): InitFile[] {
  const srcPrefix = framework.name === "next" ? nextSrcPrefix(root) : "";
  return [
    { asset: "env.example", target: ".env.example" },
    ...framework.files.map((path) => ({
      asset: path,
      target: framework.name === "next" ? `${srcPrefix}${path}` : path,
    })),
  ];
}

function cliVersion(): string {
  const pkg = JSON.parse(readFileSync(CLI_PACKAGE_JSON, "utf8")) as {
    version: string;
  };
  return pkg.version;
}

function addDependencies(
  root: string,
  pkg: PackageManifest,
  framework: FrameworkDef,
): string[] {
  const present = { ...pkg.dependencies, ...pkg.devDependencies };
  const missing = framework.dependencies.filter(
    (name) => present[name] === undefined,
  );
  if (missing.length === 0) return [];
  const range = `^${cliVersion()}`;
  const dependencies = { ...pkg.dependencies };
  for (const name of missing) dependencies[name] = range;
  pkg.dependencies = Object.fromEntries(
    Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  return missing.map((name) => `${name}@${range}`);
}

function detectInstallCommand(root: string): string {
  if (
    existsSync(join(root, "pnpm-lock.yaml")) ||
    existsSync(join(root, "pnpm-workspace.yaml"))
  ) {
    return "pnpm install";
  }
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (
    existsSync(join(root, "bun.lock")) ||
    existsSync(join(root, "bun.lockb"))
  ) {
    return "bun install";
  }
  return "npm install";
}

function frameworkNotes(
  framework: FrameworkDef,
  root: string,
  skipped: string[],
): PreflightResult[] {
  const notes: PreflightResult[] = [];
  if (framework.name === "next") {
    const home = `${nextSrcPrefix(root)}app/page.tsx`;
    if (existsSync(join(root, home))) {
      notes.push({
        status: "unknown",
        message: `${home} conflicts with the cmssy catch-all route - delete it and the cmssy page serves /`,
      });
    }
  }
  if (framework.name === "astro") {
    notes.push({
      status: "unknown",
      message:
        "the cmssy wiring needs the React integration and a server adapter - run: npx astro add react node",
    });
    if (existsSync(join(root, "src/pages/index.astro"))) {
      notes.push({
        status: "unknown",
        message:
          "src/pages/index.astro shadows the cmssy catch-all for / - delete it and the cmssy page serves /",
      });
    }
  }
  if (framework.name === "remix" && skipped.includes("app/routes.ts")) {
    notes.push({
      status: "unknown",
      message:
        "app/routes.ts already existed - mount routes/page.tsx (index + splat), routes/robots.ts and routes/sitemap.ts there yourself, or rerun with --force",
    });
  }
  return notes;
}

export function runInit(options: InitOptions, deps: InitDeps): number {
  const { log } = deps;
  try {
    const root = resolve(deps.cwd, options.dir ?? ".");
    if (!existsSync(root)) {
      throw new CliError(
        `${root} does not exist`,
        "pass --dir with the app's directory, or run cmssy init inside it",
      );
    }
    const pkg = readPackageJson(root);
    const framework = detectFramework(pkg);
    log(
      formatResult({
        status: "ok",
        message: `detected ${framework.label} - wiring cmssy into ${root}`,
      }),
    );

    const written: string[] = [];
    const skipped: string[] = [];
    for (const file of frameworkFiles(framework, root)) {
      const target = join(root, file.target);
      if (existsSync(target) && !options.force) {
        skipped.push(file.target);
        log(
          formatResult({
            status: "unknown",
            message: `${file.target} exists, skipped (--force overwrites)`,
          }),
        );
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(ASSETS_DIR, framework.name, file.asset), target);
      written.push(file.target);
      log(formatResult({ status: "ok", message: `wrote ${file.target}` }));
    }

    const added = addDependencies(root, pkg, framework);
    if (added.length > 0) {
      log(
        formatResult({
          status: "ok",
          message: `added ${added.join(", ")} to package.json`,
        }),
      );
    }

    for (const note of frameworkNotes(framework, root, skipped)) {
      log(formatResult(note));
    }

    log("");
    log(
      `${written.length} file${written.length === 1 ? "" : "s"} written, ${skipped.length} skipped.`,
    );
    log("");
    log("Next steps:");
    let step = 1;
    if (added.length > 0) log(`  ${step++}. ${detectInstallCommand(root)}`);
    log(`  ${step++}. npx @cmssy/cli link --token cs_...`);
    const registry = frameworkFiles(framework, root).find((file) =>
      file.target.endsWith("cmssy/blocks.ts"),
    );
    log(`  ${step}. add your blocks to ${registry?.target} and publish a page`);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      log(
        formatResult({
          status: "fail",
          message: error.message,
          fix: error.fix,
        }),
      );
      return 1;
    }
    log(
      formatResult({
        status: "fail",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return 1;
  }
}
