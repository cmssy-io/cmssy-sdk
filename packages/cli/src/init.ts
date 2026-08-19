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
import {
  ESLINT_CONFIG_FILE,
  ESLINT_PLUGIN,
  ESLINT_PURPOSE,
  wireEslintConfig,
} from "./eslint-config";
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
  purpose: string;
}

function frameworkFiles(framework: FrameworkDef, root: string): InitFile[] {
  const srcPrefix = framework.name === "next" ? nextSrcPrefix(root) : "";
  const files = [
    {
      asset: "env.example",
      target: ".env.example",
      purpose:
        "the variables the config reads - copy it to .env.local and fill them in",
    },
    ...framework.files.map(({ path, purpose }) => ({
      asset: path,
      target: framework.name === "next" ? `${srcPrefix}${path}` : path,
      purpose,
    })),
  ];
  if (
    framework.name === "next" &&
    existingFile(root, `${srcPrefix}app/layout`)
  ) {
    return files.filter((file) => !file.target.endsWith("/layout.tsx"));
  }
  return files;
}

function cliVersion(): string {
  const pkg = JSON.parse(readFileSync(CLI_PACKAGE_JSON, "utf8")) as {
    version: string;
  };
  return pkg.version;
}

function sortedEntries(
  entries: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function addDependencies(
  root: string,
  pkg: PackageManifest,
  framework: FrameworkDef,
  development: string[],
): string[] {
  const present = { ...pkg.dependencies, ...pkg.devDependencies };
  const absent = (name: string) => present[name] === undefined;
  const missing = framework.dependencies.filter(absent);
  const missingDev = development.filter(absent);
  if (missing.length === 0 && missingDev.length === 0) return [];

  const range = `^${cliVersion()}`;
  const pinned = (names: string[]) =>
    Object.fromEntries(names.map((name) => [name, range]));
  if (missing.length > 0) {
    pkg.dependencies = sortedEntries({
      ...pkg.dependencies,
      ...pinned(missing),
    });
  }
  if (missingDev.length > 0) {
    pkg.devDependencies = sortedEntries({
      ...pkg.devDependencies,
      ...pinned(missingDev),
    });
  }
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  return [...missing, ...missingDev].map((name) => `${name}@${range}`);
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

function existingFile(root: string, base: string): string | undefined {
  return ["tsx", "ts", "jsx", "js"]
    .map((extension) => `${base}.${extension}`)
    .find((candidate) => existsSync(join(root, candidate)));
}

function frameworkNotes(
  framework: FrameworkDef,
  root: string,
  skipped: string[],
): PreflightResult[] {
  const notes: PreflightResult[] = [];
  if (framework.name === "next") {
    const prefix = nextSrcPrefix(root);
    const home = existingFile(root, `${prefix}app/page`);
    if (home) {
      notes.push({
        status: "unknown",
        message: `${home} conflicts with the cmssy catch-all route - delete it and the cmssy page serves /`,
      });
    }
    const rootLayout = existingFile(root, `${prefix}app/layout`);
    if (rootLayout) {
      notes.push({
        status: "fail",
        message: `${rootLayout} outranks the cmssy root layouts, so they were NOT written and <html lang> stays whatever that file says`,
        fix: `delete ${rootLayout} and rerun, then move its global CSS import and metadata into BOTH ${prefix}app/[[...path]]/layout.tsx and ${prefix}app/cmssy-edit/[[...path]]/layout.tsx - they are separate roots, and an editor preview with no CSS is the usual way to find out you only did one. Routes outside the cmssy catch-alls need a root layout of their own once it is gone: move them under a route group, e.g. ${prefix}app/(site)/layout.tsx, or the build fails with "doesn't have a root layout".`,
      });
    }
    for (const layout of ["app/[[...path]]", "app/cmssy-edit/[[...path]]"]) {
      if (!rootLayout && skipped.includes(`${prefix}${layout}/layout.tsx`)) {
        notes.push({
          status: "unknown",
          message: `${prefix}${layout}/layout.tsx already existed - set <html lang={await resolveCmssyLocale(cmssy, path)}> there yourself (import from @cmssy/core), or the site declares one language while rendering another`,
        });
      }
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
        "app/routes.ts already existed - mount routes/page.tsx (index + splat) there yourself, or rerun with --force",
    });
  }
  if (framework.name === "remix" && skipped.includes("app/root.tsx")) {
    notes.push({
      status: "unknown",
      message:
        "app/root.tsx already existed - set <html lang={useCmssyLocale()}> in its Layout yourself (import from @cmssy/remix), or the site declares one language while rendering another",
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
      log(`    ${file.purpose}`);
    }

    const eslint = wireEslintConfig(
      root,
      pkg,
      join(ASSETS_DIR, ESLINT_CONFIG_FILE),
    );
    if (eslint.written) {
      written.push(eslint.written);
      log(formatResult({ status: "ok", message: `wrote ${eslint.written}` }));
      log(`    ${ESLINT_PURPOSE}`);
    }
    if (eslint.patched) {
      log(
        formatResult({
          status: "ok",
          message: `wired ${ESLINT_PLUGIN} into ${eslint.patched}`,
        }),
      );
      log(`    ${ESLINT_PURPOSE}`);
    }

    const added = addDependencies(
      root,
      pkg,
      framework,
      eslint.dependency ? [ESLINT_PLUGIN] : [],
    );
    if (added.length > 0) {
      log(
        formatResult({
          status: "ok",
          message: `added ${added.join(", ")} to package.json`,
        }),
      );
    }

    for (const note of [
      ...frameworkNotes(framework, root, skipped),
      ...eslint.notes,
    ]) {
      log(formatResult(note));
    }

    log("");
    log(
      `${written.length} file${written.length === 1 ? "" : "s"} written, ${skipped.length} skipped.`,
    );
    log("");
    log("What not to break:");
    for (const warning of framework.warnings) log(`  - ${warning}`);
    log("  full wiring, and what each file is doing: docs/wiring.md");
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
