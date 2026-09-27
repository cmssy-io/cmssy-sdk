import { describe, expect, it } from "vitest";

import {
  CORE_SYMBOLS,
  MIDDLEWARE_SYMBOLS,
  RENAMES,
  RETIRED_SYMBOLS,
  SERVER_SYMBOLS,
  transform,
} from "../v5";
import { entrySurface, exportsOf } from "./entry-surface";
import NEXT4_EXPORTS from "./next4-exports.json";

const DESTINATIONS: Array<[string, Set<string>]> = [
  ["@cmssy/next/server", SERVER_SYMBOLS],
  ["@cmssy/next/middleware", MIDDLEWARE_SYMBOLS],
  ["@cmssy/core", CORE_SYMBOLS],
];

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
      'import { createCmssyProxy } from "@cmssy/next/preset";\nimport { CmssyLayoutSlot } from "@cmssy/next/preset";',
    );
    expect(code).toContain('from "@cmssy/next/middleware"');
    expect(code).toContain(
      'import { CmssyLayoutSlot } from "@cmssy/next/server";',
    );
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

  it("does not read an inherited object key as a rename or a refusal", () => {
    const source = 'import { toString, constructor } from "@cmssy/next";';

    expect(transform(source)).toEqual({ code: source, changed: false });
  });

  it("sends symbols that moved to @cmssy/core there, not to the root", () => {
    const { code } = transform(
      'import { verifyCmssyWebhook, evaluateFieldConditionGroup } from "@cmssy/next";',
    );
    expect(code).toBe(
      'import { verifyCmssyWebhook, evaluateFieldConditionGroup } from "@cmssy/core";',
    );
  });

  it("refuses to move a symbol the SDK no longer has, and says where it went", () => {
    const source = 'import { fetchOrderByToken } from "@cmssy/next";';
    const { code, notes } = transform(source);

    expect(code).toBe(source);
    expect(notes).toEqual([
      "fetchOrderByToken is gone from the SDK - your Server Actions over the cart and order mutations",
    ]);
  });

  it("moves the live half of a mixed import and leaves the retired half in place", () => {
    const { code, notes } = transform(
      'import { createCmssyPage, getCmssyUser } from "@cmssy/next";',
    );

    expect(code).toContain(
      'import { createCmssyPage } from "@cmssy/next/server";',
    );
    expect(code).toContain('import { getCmssyUser } from "@cmssy/next";');
    expect(notes).toHaveLength(1);
    expect(notes?.[0]).toContain("getCmssyUser is gone from the SDK");
  });

  it("does not rewrite CmssyLink to an entry point that does not exist", () => {
    const { code, notes } = transform(
      'import { CmssyLink } from "@cmssy/next";',
    );

    expect(code).not.toContain("@cmssy/next/client");
    expect(entrySurface().has("@cmssy/next/client")).toBe(false);
    expect(notes?.[0]).toContain("next/link plus localizeHref");
  });

  it.each(DESTINATIONS)(
    "every symbol it routes to %s is exported there",
    (entry, symbols) => {
      const real = exportsOf(entry);
      const absent = [...symbols].filter((symbol) => !real.has(symbol));

      expect(absent).toEqual([]);
    },
  );

  it("routes nothing it rewrites to a symbol that is retired", () => {
    const routed = [...SERVER_SYMBOLS, ...MIDDLEWARE_SYMBOLS, ...CORE_SYMBOLS];
    const both = routed.filter((symbol) =>
      Object.hasOwn(RETIRED_SYMBOLS, symbol),
    );

    expect(both).toEqual([]);
  });

  it("names a replacement for every retired symbol", () => {
    const silent = Object.entries(RETIRED_SYMBOLS)
      .filter(([, replacement]) => replacement.trim().length === 0)
      .map(([symbol]) => symbol);

    expect(silent).toEqual([]);
  });

  it("keeps no retired symbol that an entry it targets exports again", () => {
    const targeted = [
      "@cmssy/next",
      "@cmssy/next/server",
      "@cmssy/next/middleware",
      "@cmssy/core",
    ];
    const back = Object.keys(RETIRED_SYMBOLS).filter((symbol) =>
      targeted.some((entry) => exportsOf(entry).has(symbol)),
    );

    expect(back).toEqual([]);
  });

  it("gives every 4.x export a home that resolves", () => {
    const rootExports = exportsOf("@cmssy/next");
    const homeless = (NEXT4_EXPORTS as string[]).filter((symbol) => {
      const renamed = RENAMES[symbol] ?? symbol;
      if (Object.hasOwn(RETIRED_SYMBOLS, renamed)) return false;
      for (const [entry, symbols] of DESTINATIONS) {
        if (symbols.has(renamed)) return !exportsOf(entry).has(renamed);
      }
      return !rootExports.has(renamed);
    });

    expect(homeless).toEqual([]);
  });

  it("rewrites the whole 4.x surface into imports that resolve, or names what it left", () => {
    const { code, notes } = transform(
      `import { ${(NEXT4_EXPORTS as string[]).join(", ")} } from "@cmssy/next";`,
    );
    const named = new Set(
      (notes ?? []).map((note) => note.split(" ")[0] ?? ""),
    );

    const unresolved: string[] = [];
    for (const line of code.matchAll(
      /import\s+\{([^}]*)\}\s+from\s+"([^"]+)"/g,
    )) {
      const entry = line[2] ?? "";
      for (const part of (line[1] ?? "").split(",")) {
        const symbol = part.trim();
        if (!symbol || named.has(symbol)) continue;
        if (!exportsOf(entry).has(symbol))
          unresolved.push(`${symbol} @ ${entry}`);
      }
    }

    const retiredInV4 = new Set(
      (NEXT4_EXPORTS as string[])
        .map((symbol) => RENAMES[symbol] ?? symbol)
        .filter((symbol) => Object.hasOwn(RETIRED_SYMBOLS, symbol)),
    );

    expect(unresolved).toEqual([]);
    expect([...named].sort()).toEqual([...retiredInV4].sort());
  });

  it("knows every symbol that lives ONLY on a runtime entry", () => {
    const mapped = new Set([...SERVER_SYMBOLS, ...MIDDLEWARE_SYMBOLS]);
    const onRoot = exportsOf("@cmssy/next");
    const missing = [
      ...exportsOf("@cmssy/next/server"),
      ...exportsOf("@cmssy/next/middleware"),
    ].filter((symbol) => !mapped.has(symbol) && !onRoot.has(symbol));

    expect(missing).toEqual([]);
  });
});
