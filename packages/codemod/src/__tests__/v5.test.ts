import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CLIENT_SYMBOLS,
  MIDDLEWARE_SYMBOLS,
  SERVER_SYMBOLS,
  transform,
} from "../v5";

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

  // The map IS the codemod. If a runtime entry gains an export the map does not
  // know, the codemod leaves that import on the root - which does not export it
  // - and the consumer's build breaks on a migration we called automatic.
  // Symbols the root also exports are exempt: leaving those alone is correct.
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
