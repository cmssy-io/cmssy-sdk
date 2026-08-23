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

function renderersOf(marker: string): string[] {
  return sources.filter((file) => readFileSync(file, "utf8").includes(marker));
}

function expectBothHalves(renderers: string[]) {
  for (const file of renderers) {
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
}

function expectResolvedFirst(renderers: string[], resolver: string) {
  const resolvers = new Set(renderersOf(resolver).map(framework));

  for (const name of new Set(renderers.map(framework))) {
    it(`${name} calls ${resolver}`, () => {
      expect(resolvers).toContain(name);
    });
  }
}

const pageBlockRenderers = renderersOf("page.blocks");
const layoutBlockRenderers = renderersOf("group.blocks");

describe("scaffolded page blocks receive both halves of the resolution", () => {
  it("finds the render sites", () => {
    expect(pageBlockRenderers.map(relative).sort()).toEqual([
      "astro/src/components/Blocks.tsx",
      "remix/app/routes/page.tsx",
    ]);
  });

  expectBothHalves(pageBlockRenderers);
});

describe("every scaffold that renders page blocks resolves them first", () => {
  expectResolvedFirst(pageBlockRenderers, "resolveEditorBlockData");
});

describe("scaffolded layout blocks receive both halves of the resolution", () => {
  it("finds the render sites", () => {
    expect(layoutBlockRenderers.map(relative).sort()).toEqual([
      "astro/src/cmssy/layout-slot.tsx",
      "remix/app/cmssy/layout-slot.tsx",
    ]);
  });

  expectBothHalves(layoutBlockRenderers);
});

describe("every scaffold that renders layout blocks resolves them first", () => {
  expectResolvedFirst(layoutBlockRenderers, "resolveEditorLayoutBlockData");
});
