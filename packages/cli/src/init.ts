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
  const files = [
    { asset: "env.example", target: ".env.example" },
    ...framework.files.map((path) => ({
      asset: path,
      target: framework.name === "next" ? `${srcPrefix}${path}` : path,
    })),
  ];
  // The cmssy layouts render <html>, which only a root layout may do. Written
  // under an app that already has one they are nested instead, and a second
  // <html> inside the first is invalid markup that builds fine and fails as a
  // hydration error at runtime. Better to write nothing and say why.
  if (framework.name === "next" && existingFile(root, `${srcPrefix}app/layout`)) {
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

// A Next app scaffolded without --ts has app/layout.js, and a nested <html>
// inside the app's own is invalid markup that no build warns about.
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
