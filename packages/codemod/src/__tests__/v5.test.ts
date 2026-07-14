import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CLIENT_SYMBOLS,
  CORE_SYMBOLS,
  MIDDLEWARE_SYMBOLS,
  RENAMES,
  SERVER_SYMBOLS,
  transform,
} from "../v5";
import NEXT4_EXPORTS from "./next4-exports.json";

const NEXT_SRC = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../next/src",
);

/** The names an entry actually exports, as written in its barrel. */
function exportedSymbols(entry: string): string[] {
  const code = readFileSync(resolve(NEXT_SRC, entry), "utf8");
  const blocks = [...code.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)];
  return blocks
    .flatMap(([, body]) => (body ?? "").split(","))
    .map(
      (name) =>
        name
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0] ?? "",
    )
    .filter(Boolean);
}

describe("v5 codemod", () => {
  it("splits one import across the runtimes it actually spans", () => {
    const { code } = transform(
      'import { createCmssyPage, createCmssyProxy } from "@cmssy/next";',
    );
    expect(code).toContain(
      'import { createCmssyPage } from "@cmssy/next/server";',
    );
    expect(code).toContain(
      'import { createCmssyProxy } from "@cmssy/next/middleware";',
    );
  });

  it("rewrites the preset, which no longer exists", () => {
    const { code } = transform(
      'import { createCmssyProxy } from "@cmssy/next/preset";\nimport { CmssyChrome } from "@cmssy/next/preset";',
    );
    expect(code).toContain('from "@cmssy/next/middleware"');
    expect(code).toContain('import { CmssyChrome } from "@cmssy/next/server";');
    expect(code).not.toContain("preset");
  });

  it("applies the renames, in imports and in use", () => {
    const { code } = transform(
      'import type { CmssyNextConfig } from "@cmssy/next";\nexport const c: CmssyNextConfig = x;',
    );
    expect(code).toContain('import type { CmssyConfig } from "@cmssy/next";');
    expect(code).toContain("export const c: CmssyConfig = x;");
  });

  it("keeps config and constants on the root entry", () => {
    const { code } = transform(
      'import { defineCmssyConfig } from "@cmssy/next";',
    );
    expect(code).toBe('import { defineCmssyConfig } from "@cmssy/next";');
  });

  it("leaves a file with no cmssy imports alone", () => {
    const source = 'import { useState } from "react";';
    expect(transform(source)).toEqual({ code: source, changed: false });
  });

  it("sends symbols that moved to @cmssy/core there, not to the root", () => {
    const { code } = transform(
      'import { fetchOrderByToken, verifyCmssyWebhook } from "@cmssy/next";',
    );
    expect(code).toBe(
      'import { fetchOrderByToken, verifyCmssyWebhook } from "@cmssy/core";',
    );
  });

  // THE test. A 4.x app imports 79 symbols from @cmssy/next. Every one of them
  // must land somewhere in 5.0 - a runtime entry, @cmssy/core, or a rename.
  // A symbol with no home is silently left on the root, which no longer exports
  // it, so `npx @cmssy/codemod v5` hands the developer a broken build and calls
  // the migration automatic. This caught 28 of them, including fetchOrderByToken
  // - found only because cmssy-demo's build failed on it.
  it("gives every 4.x export a home in 5.0", () => {
    const rootExports = new Set(exportedSymbols("index.ts"));
    const homeless = (NEXT4_EXPORTS as string[]).filter(
      (symbol) =>
        !SERVER_SYMBOLS.has(symbol) &&
        !MIDDLEWARE_SYMBOLS.has(symbol) &&
        !CLIENT_SYMBOLS.has(symbol) &&
        !CORE_SYMBOLS.has(symbol) &&
        !(symbol in RENAMES) &&
        !rootExports.has(symbol),
    );

    expect(homeless).toEqual([]);
  });

  // If a runtime entry gains an export the map does not know, the codemod leaves
  // that import on the root, which does not export it. Symbols the root also
  // exports are exempt: leaving those alone is correct.
  it("knows every symbol that lives ONLY on a runtime entry", () => {
    const mapped = new Set([
      ...SERVER_SYMBOLS,
      ...MIDDLEWARE_SYMBOLS,
      ...CLIENT_SYMBOLS,
    ]);
    const onRoot = new Set(exportedSymbols("index.ts"));
    const missing = [
      ...exportedSymbols("server.ts"),
      ...exportedSymbols("middleware.ts"),
      ...exportedSymbols("client.ts"),
    ].filter((symbol) => !mapped.has(symbol) && !onRoot.has(symbol));

    expect(missing).toEqual([]);
  });
});
