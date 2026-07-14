import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// @cmssy/core is the reason a Vue, Svelte or Astro app can talk to cmssy at all.
// The day one module here imports React or Next, that promise is gone - and it
// would go quietly, because every one of our own apps happens to run Next. This
// test is the only thing standing between "framework-agnostic" and a slogan.

const FORBIDDEN = [
  /^react(\/|$)/,
  /^react-dom(\/|$)/,
  /^next(\/|$)/,
  /^vue(\/|$)/,
  /^svelte(\/|$)/,
  // Node built-ins are a framework too - the framework of one runtime. core
  // imported node's `crypto` for HMAC, and the day an Astro island pulled core
  // into a browser bundle, the build died on it. Web Crypto works everywhere;
  // node:crypto works in exactly one place.
  /^(node:)?(crypto|fs|path|os|http|https|stream|buffer|child_process|url|util)$/,
];

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === "__tests__" ? [] : sourceFiles(path);
    }
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

function importedModules(code: string): string[] {
  const pattern = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
  return [...code.matchAll(pattern)].map(([, specifier]) => specifier ?? "");
}

describe("framework boundary", () => {
  const files = sourceFiles(SRC);

  it("finds the core sources", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.slice(SRC.length + 1), f] as const))(
    "%s imports no framework",
    (_name, file) => {
      const offenders = importedModules(readFileSync(file, "utf8")).filter(
        (specifier) => FORBIDDEN.some((pattern) => pattern.test(specifier)),
      );
      expect(offenders).toEqual([]);
    },
  );
});
