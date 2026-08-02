import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveLocal(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function valueImports(code: string): string[] {
  const withoutTypes = code.replace(
    /^\s*(?:import|export)\s+type\s[^;]*;/gm,
    "",
  );
  return [
    ...withoutTypes.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
  ].map(([, specifier]) => specifier ?? "");
}

function reachableFrom(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue = [resolve(SRC, entry)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    const specifiers = valueImports(readFileSync(file, "utf8"));
    seen.set(file, specifiers);
    for (const specifier of specifiers) {
      const local = resolveLocal(file, specifier);
      if (local) queue.push(local);
    }
  }
  return seen;
}

function forbiddenImports(entry: string, forbidden: RegExp[]): string[] {
  const offences: string[] = [];
  for (const [file, specifiers] of reachableFrom(entry)) {
    for (const specifier of specifiers) {
      if (forbidden.some((pattern) => pattern.test(specifier))) {
        offences.push(`${file.slice(SRC.length + 1)} imports ${specifier}`);
      }
    }
  }
  return offences;
}

describe("entry boundaries", () => {
  it("middleware reaches no server-only code", () => {
    expect(
      forbiddenImports("middleware.ts", [/^server-only$/, /^next\/headers$/]),
    ).toEqual([]);
  });

  it("the root entry is safe in every runtime", () => {
    expect(
      forbiddenImports("index.ts", [
        /^server-only$/,
        /^next\/headers$/,
        /^next\/navigation$/,
      ]),
    ).toEqual([]);
  });

  it("the server entry declares itself server-only", () => {
    const code = readFileSync(resolve(SRC, "server.ts"), "utf8");
    expect(code.startsWith('import "server-only";')).toBe(true);
  });
});
