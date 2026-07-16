import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runInit, type InitDeps } from "../init";

const CLI_VERSION = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../package.json", import.meta.url)),
      "utf8",
    ),
  ) as { version: string }
).version;

const NEXT_FILES = [
  ".env.example",
  "cmssy.config.ts",
  "proxy.ts",
  "cmssy/blocks.ts",
  "cmssy/editor.tsx",
  "cmssy/editable-layout.tsx",
  "blocks/hero/block.ts",
  "blocks/hero/Hero.tsx",
  "app/[[...path]]/page.tsx",
  "app/cmssy-edit/[[...path]]/page.tsx",
  "app/api/draft/route.ts",
  "app/robots.ts",
  "app/sitemap.ts",
];

function makeApp(pkg: Record<string, unknown>): {
  deps: InitDeps;
  lines: string[];
  cwd: string;
} {
  const cwd = mkdtempSync(join(tmpdir(), "cmssy-init-"));
  writeFileSync(join(cwd, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  const lines: string[] = [];
  return { deps: { cwd, log: (line) => lines.push(line) }, lines, cwd };
}

function readPkg(cwd: string): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
}

describe("runInit", () => {
  it("fails with a per-framework hint when no framework is detected", () => {
    const { deps, lines } = makeApp({ dependencies: { express: "^4.0.0" } });
    const code = runInit({}, deps);
    expect(code).toBe(1);
    const output = lines.join("\n");
    expect(output).toContain("no supported framework");
    expect(output).toContain("npx create-next-app@latest");
    expect(output).toContain("npm create astro@latest");
    expect(output).toContain("npx create-react-router@latest");
  });

  it("fails when the target has no package.json", () => {
    const cwd = mkdtempSync(join(tmpdir(), "cmssy-init-"));
    const lines: string[] = [];
    const code = runInit({}, { cwd, log: (line) => lines.push(line) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("no package.json");
  });

  it("fails when --dir points nowhere", () => {
    const { deps, lines } = makeApp({ dependencies: { next: "^16.0.0" } });
    const code = runInit({ dir: "does-not-exist" }, deps);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("does not exist");
  });

  it("writes the full next wiring on a fresh app", () => {
    const { deps, cwd, lines } = makeApp({
      dependencies: { next: "^16.0.0", react: "^19.0.0" },
    });
    const code = runInit({}, deps);
    expect(code).toBe(0);
    for (const file of NEXT_FILES) {
      expect(existsSync(join(cwd, file)), file).toBe(true);
    }
    const output = lines.join("\n");
    expect(output).toContain("detected Next.js");
    expect(output).toContain(`${NEXT_FILES.length} files written, 0 skipped.`);
    expect(output).toContain("npx @cmssy/cli link");
  });

  it("places the next wiring under src/ when the app uses a src directory", () => {
    const { deps, cwd } = makeApp({ dependencies: { next: "^16.0.0" } });
    mkdirSync(join(cwd, "src", "app"), { recursive: true });
    const code = runInit({}, deps);
    expect(code).toBe(0);
    expect(existsSync(join(cwd, "src/cmssy.config.ts"))).toBe(true);
    expect(existsSync(join(cwd, "src/proxy.ts"))).toBe(true);
    expect(existsSync(join(cwd, "src/app/[[...path]]/page.tsx"))).toBe(true);
    expect(existsSync(join(cwd, ".env.example"))).toBe(true);
    expect(existsSync(join(cwd, "cmssy.config.ts"))).toBe(false);
  });

  it("skips every existing file on a second run", () => {
    const { deps, cwd, lines } = makeApp({
      dependencies: { next: "^16.0.0" },
    });
    expect(runInit({}, deps)).toBe(0);
    writeFileSync(join(cwd, "cmssy.config.ts"), "my own config\n");
    lines.length = 0;
    expect(runInit({}, deps)).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("cmssy.config.ts exists, skipped");
    expect(output).toContain(`0 files written, ${NEXT_FILES.length} skipped.`);
    expect(readFileSync(join(cwd, "cmssy.config.ts"), "utf8")).toBe(
      "my own config\n",
    );
  });

  it("overwrites with --force", () => {
    const { deps, cwd } = makeApp({ dependencies: { next: "^16.0.0" } });
    expect(runInit({}, deps)).toBe(0);
    writeFileSync(join(cwd, "cmssy.config.ts"), "my own config\n");
    expect(runInit({ force: true }, deps)).toBe(0);
    expect(readFileSync(join(cwd, "cmssy.config.ts"), "utf8")).toContain(
      "defineCmssyConfig",
    );
  });

  it("adds the missing cmssy deps pinned to the CLI version, idempotently", () => {
    const { deps, cwd, lines } = makeApp({
      dependencies: { next: "^16.0.0", "@cmssy/react": "^1.0.0" },
    });
    expect(runInit({}, deps)).toBe(0);
    const pkg = readPkg(cwd);
    expect(pkg.dependencies?.["@cmssy/next"]).toBe(`^${CLI_VERSION}`);
    expect(pkg.dependencies?.["@cmssy/react"]).toBe("^1.0.0");
    expect(lines.join("\n")).toContain(
      `added @cmssy/next@^${CLI_VERSION} to package.json`,
    );
    lines.length = 0;
    expect(runInit({}, deps)).toBe(0);
    expect(readPkg(cwd)).toEqual(pkg);
    expect(lines.join("\n")).not.toContain("added @cmssy/next");
  });

  it("suggests the lockfile's package manager for the install step", () => {
    const { deps, cwd, lines } = makeApp({
      dependencies: { next: "^16.0.0" },
    });
    writeFileSync(join(cwd, "pnpm-lock.yaml"), "");
    expect(runInit({}, deps)).toBe(0);
    expect(lines.join("\n")).toContain("pnpm install");
  });

  it("warns when app/page.tsx conflicts with the next catch-all", () => {
    const { deps, cwd, lines } = makeApp({
      dependencies: { next: "^16.0.0" },
    });
    mkdirSync(join(cwd, "app"));
    writeFileSync(join(cwd, "app/page.tsx"), "export default () => null;\n");
    expect(runInit({}, deps)).toBe(0);
    expect(lines.join("\n")).toContain(
      "app/page.tsx conflicts with the cmssy catch-all route",
    );
  });

  it("writes the astro wiring and points at astro add", () => {
    const { deps, cwd, lines } = makeApp({
      dependencies: { astro: "^5.0.0" },
    });
    expect(runInit({}, deps)).toBe(0);
    for (const file of [
      ".env.example",
      "src/cmssy.config.ts",
      "src/middleware.ts",
      "src/cmssy/blocks.ts",
      "src/cmssy/editor.tsx",
      "src/cmssy/hero.tsx",
      "src/components/Blocks.tsx",
      "src/pages/[...path].astro",
      "src/pages/cmssy-edit/[...path].astro",
      "src/pages/robots.txt.ts",
      "src/pages/sitemap.xml.ts",
    ]) {
      expect(existsSync(join(cwd, file)), file).toBe(true);
    }
    const pkg = readPkg(cwd);
    expect(pkg.dependencies?.["@cmssy/astro"]).toBe(`^${CLI_VERSION}`);
    expect(pkg.dependencies?.["@cmssy/core"]).toBe(`^${CLI_VERSION}`);
    expect(lines.join("\n")).toContain("npx astro add react node");
  });

  it("detects react-router from devDependencies and warns about an existing routes.ts", () => {
    const { deps, cwd, lines } = makeApp({
      dependencies: { "react-router": "^7.5.0" },
      devDependencies: { "@react-router/dev": "^7.5.0" },
    });
    mkdirSync(join(cwd, "app"));
    writeFileSync(join(cwd, "app/routes.ts"), "export default [];\n");
    expect(runInit({}, deps)).toBe(0);
    for (const file of [
      ".env.example",
      "cmssy.config.ts",
      "app/cmssy/blocks.ts",
      "app/cmssy/editor.tsx",
      "app/cmssy/hero.tsx",
      "app/routes/page.tsx",
      "app/routes/robots.ts",
      "app/routes/sitemap.ts",
    ]) {
      expect(existsSync(join(cwd, file)), file).toBe(true);
    }
    const output = lines.join("\n");
    expect(output).toContain("detected React Router");
    expect(output).toContain("app/routes.ts exists, skipped");
    expect(output).toContain("app/routes.ts already existed");
    expect(readFileSync(join(cwd, "app/routes.ts"), "utf8")).toBe(
      "export default [];\n",
    );
    expect(readPkg(cwd).dependencies?.["@cmssy/remix"]).toBe(`^${CLI_VERSION}`);
  });
});
