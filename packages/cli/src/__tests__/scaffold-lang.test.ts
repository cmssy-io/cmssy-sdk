import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ASSETS = fileURLToPath(new URL("../../assets/init", import.meta.url));

function asset(path: string): string {
  return readFileSync(`${ASSETS}/${path}`, "utf8");
}

/**
 * Every scaffolded file that renders `<html>`, and the resolver it must take
 * the language from. Astro's pages read it off `loadCmssyPage`.
 */
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

// The Next and Remix scaffolds shipped `<html lang="en">` on every page for
// several releases - a page at /no declared English while rendering Norwegian.
// Nothing in this repo could see it: the assets are copied, never compiled, and
// the end-to-end check that would have caught it needs a workspace with a
// second language, which is content this repo must not depend on.
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
