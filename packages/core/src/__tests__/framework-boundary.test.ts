import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const FORBIDDEN = [
  /^react(\/|$)/,
  /^react-dom(\/|$)/,
  /^next(\/|$)/,
  /^vue(\/|$)/,
  /^svelte(\/|$)/,
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
