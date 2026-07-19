import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runAddBlock, type AddBlockDeps } from "../add-block";
import { runInit } from "../init";

function makeApp(pkg: Record<string, unknown>): {
  deps: AddBlockDeps;
  lines: string[];
  cwd: string;
} {
  const cwd = mkdtempSync(join(tmpdir(), "cmssy-add-block-"));
  writeFileSync(join(cwd, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  const lines: string[] = [];
  return { deps: { cwd, log: (line) => lines.push(line) }, lines, cwd };
}

function initApp(pkg: Record<string, unknown>): {
  deps: AddBlockDeps;
  lines: string[];
  cwd: string;
} {
  const app = makeApp(pkg);
  expect(runInit({}, { cwd: app.cwd, log: () => {} })).toBe(0);
  return app;
}

describe("runAddBlock", () => {
  it("rejects a non-kebab-case name", () => {
    const { deps, lines } = makeApp({ dependencies: { next: "^16.0.0" } });
    const code = runAddBlock({ name: "PricingTable" }, deps);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("not a valid block name");
  });

  it("fails when no framework is detected", () => {
    const { deps, lines } = makeApp({ dependencies: { express: "^4.0.0" } });
    const code = runAddBlock({ name: "pricing-table" }, deps);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("no supported framework");
  });

  it("fails when the registry is missing and points at cmssy init", () => {
    const { deps, lines } = makeApp({ dependencies: { next: "^16.0.0" } });
    const code = runAddBlock({ name: "pricing-table" }, deps);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("run cmssy init first");
  });

  it("scaffolds and registers a next block", () => {
    const { deps, cwd, lines } = initApp({
      dependencies: { next: "^16.0.0" },
    });
    const code = runAddBlock({ name: "pricing-table" }, deps);
    expect(code).toBe(0);

    const definition = readFileSync(
      join(cwd, "blocks/pricing-table/block.ts"),
      "utf8",
    );
    expect(definition).toContain('type: "pricing-table"');
    expect(definition).toContain('label: "Pricing Table"');
    expect(definition).toContain(
      'import PricingTable, { pricingTableProps } from "./PricingTable"',
    );

    const component = readFileSync(
      join(cwd, "blocks/pricing-table/PricingTable.tsx"),
      "utf8",
    );
    expect(component).toContain("export const pricingTableProps");
    expect(component).toContain("export default function PricingTable");
    expect(component).toContain("BlockProps<typeof pricingTableProps>");

    const registry = readFileSync(join(cwd, "cmssy/blocks.ts"), "utf8");
    expect(registry).toContain(
      'import { pricingTableBlock } from "@/blocks/pricing-table/block";',
    );
    expect(registry).toContain("[heroBlock, pricingTableBlock]");

    const output = lines.join("\n");
    expect(output).toContain("registered pricingTableBlock in cmssy/blocks.ts");
    expect(output).toContain("Next steps:");
  });

  it("places a next block under src/ when the app uses a src directory", () => {
    const { deps, cwd } = makeApp({ dependencies: { next: "^16.0.0" } });
    mkdirSync(join(cwd, "src", "app"), { recursive: true });
    expect(runInit({}, { cwd, log: () => {} })).toBe(0);
    expect(runAddBlock({ name: "faq" }, deps)).toBe(0);
    expect(existsSync(join(cwd, "src/blocks/faq/block.ts"))).toBe(true);
    expect(existsSync(join(cwd, "src/blocks/faq/Faq.tsx"))).toBe(true);
    expect(readFileSync(join(cwd, "src/cmssy/blocks.ts"), "utf8")).toContain(
      "faqBlock",
    );
  });

  it("refuses a block that is already registered", () => {
    const { deps, lines } = initApp({ dependencies: { next: "^16.0.0" } });
    const code = runAddBlock({ name: "hero" }, deps);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain('block "hero" is already registered');
  });

  it("appends to a multi-line blocks array without breaking formatting", () => {
    const { deps, cwd } = initApp({ dependencies: { next: "^16.0.0" } });
    writeFileSync(
      join(cwd, "cmssy/blocks.ts"),
      [
        'import { heroBlock } from "@/blocks/hero/block";',
        "",
        "export const blocks = [",
        "  heroBlock,",
        "];",
        "",
      ].join("\n"),
    );
    expect(runAddBlock({ name: "faq-list" }, deps)).toBe(0);
    const registry = readFileSync(join(cwd, "cmssy/blocks.ts"), "utf8");
    expect(registry).toContain("  heroBlock,\n  faqListBlock,\n];");
  });

  it("fails loud when the registry has no blocks array and writes nothing", () => {
    const { deps, cwd, lines } = initApp({ dependencies: { next: "^16.0.0" } });
    writeFileSync(join(cwd, "cmssy/blocks.ts"), "export const other = 1;\n");
    const code = runAddBlock({ name: "faq" }, deps);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("could not find `export const blocks");
    expect(existsSync(join(cwd, "blocks/faq"))).toBe(false);
    expect(readFileSync(join(cwd, "cmssy/blocks.ts"), "utf8")).toBe(
      "export const other = 1;\n",
    );
  });

  it("scaffolds and registers an astro block in the registry file", () => {
    const { deps, cwd } = initApp({ dependencies: { astro: "^5.0.0" } });
    expect(runAddBlock({ name: "pricing-table" }, deps)).toBe(0);

    const component = readFileSync(
      join(cwd, "src/cmssy/pricing-table.tsx"),
      "utf8",
    );
    expect(component).toContain("export function PricingTable");
    expect(component).toContain("export const pricingTableProps");

    const registry = readFileSync(join(cwd, "src/cmssy/blocks.ts"), "utf8");
    expect(registry).toContain(
      'import { PricingTable, pricingTableProps } from "./pricing-table";',
    );
    expect(registry).toContain(
      "export const pricingTableBlock = defineBlock({",
    );
    expect(registry).toContain('type: "pricing-table"');
    expect(registry).toContain("[heroBlock, pricingTableBlock]");
  });

  it("scaffolds and registers a remix block in the registry file", () => {
    const { deps, cwd } = initApp({
      dependencies: { "react-router": "^7.5.0" },
    });
    expect(runAddBlock({ name: "cta" }, deps)).toBe(0);
    expect(existsSync(join(cwd, "app/cmssy/cta.tsx"))).toBe(true);
    const registry = readFileSync(join(cwd, "app/cmssy/blocks.ts"), "utf8");
    expect(registry).toContain('import { Cta, ctaProps } from "./cta";');
    expect(registry).toContain("[heroBlock, ctaBlock]");
  });
});
