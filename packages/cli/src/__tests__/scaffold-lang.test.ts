import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const ASSETS = fileURLToPath(new URL("../../assets/init", import.meta.url));

function asset(path: string): string {
  return readFileSync(`${ASSETS}/${path}`, "utf8");
}

const RENDERS_HTML: Array<{ file: string; resolver: RegExp }> = [
  {
    file: "next/app/[[...path]]/layout.tsx",
    resolver: /resolveCmssyLocale\(/,
  },
  {
    file: "next/app/cmssy-edit/[[...path]]/layout.tsx",
    resolver: /resolveCmssyLocale\(/,
  },
  { file: "remix/app/root.tsx", resolver: /useCmssyLocale\(/ },
  { file: "astro/src/pages/[...path].astro", resolver: /loadCmssyPage\(/ },
  {
    file: "astro/src/pages/cmssy-edit/[...path].astro",
    resolver: /loadCmssyPage\(/,
  },
];

describe("scaffolded <html lang>", () => {
  for (const { file, resolver } of RENDERS_HTML) {
    it(`${file} takes its language from the resolver`, () => {
      const source = asset(file);

      expect(source).toMatch(/<html[^>]*\slang=\{/);
      expect(source).toMatch(resolver);
    });

    it(`${file} hardcodes no language`, () => {
      expect(asset(file)).not.toMatch(/<html[^>]*\slang=["'][a-z]/i);
    });
  }
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("scaffolded sources parse", () => {
  const sources = walk(ASSETS).filter((file) => /\.tsx?$/.test(file));

  it("finds the assets", () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  for (const file of sources) {
    it(`${file.slice(ASSETS.length + 1)} is valid TypeScript`, () => {
      const source = readFileSync(file, "utf8");
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      const errors =
        (parsed as unknown as { parseDiagnostics?: ts.Diagnostic[] })
          .parseDiagnostics ?? [];
      expect(
        errors.map((d) =>
          ts.flattenDiagnosticMessageText(d.messageText, " "),
        ),
      ).toEqual([]);
    });
  }
});
