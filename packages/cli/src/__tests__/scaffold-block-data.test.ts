import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ASSETS = fileURLToPath(new URL("../../assets/init", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function relative(file: string): string {
  return file.slice(ASSETS.length + 1);
}

function framework(file: string): string {
  return relative(file).split("/")[0] ?? "";
}

const sources = walk(ASSETS).filter((file) => /\.(tsx?|astro)$/.test(file));

const pageBlockRenderers = sources.filter((file) =>
  readFileSync(file, "utf8").includes("page.blocks"),
);

describe("scaffolded page blocks receive both halves of the resolution", () => {
  it("finds the render sites", () => {
    expect(pageBlockRenderers.map(relative).sort()).toEqual([
      "astro/src/components/Blocks.tsx",
      "remix/app/routes/page.tsx",
    ]);
  });

  for (const file of pageBlockRenderers) {
    const elements =
      readFileSync(file, "utf8").match(/<CmssyBlock\b[\s\S]*?\/>/g) ?? [];

    it(`${relative(file)} renders at least one block`, () => {
      expect(elements.length).toBeGreaterThan(0);
    });

    for (const [index, element] of elements.entries()) {
      it(`${relative(file)} block ${index} receives its loader result`, () => {
        expect(element).toMatch(/\bdata=\{/);
      });

      it(`${relative(file)} block ${index} receives its resolved content`, () => {
        expect(element).toMatch(/\bresolvedContent=\{/);
      });
    }
  }
});

describe("every scaffold that renders page blocks resolves them first", () => {
  const resolvers = new Set(
    sources
      .filter((file) => readFileSync(file, "utf8").includes("resolveEditorBlockData"))
      .map(framework),
  );

  for (const name of new Set(pageBlockRenderers.map(framework))) {
    it(`${name} calls resolveEditorBlockData`, () => {
      expect(resolvers).toContain(name);
    });
  }
});
