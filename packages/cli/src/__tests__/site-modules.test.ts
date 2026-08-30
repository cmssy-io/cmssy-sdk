import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadSiteModule } from "../site-modules";

const packagesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function write(root: string, path: string, source: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), source);
}

function scaffoldSite(): string {
  const root = mkdtempSync(join(tmpdir(), "cmssy-site-"));
  mkdirSync(join(root, "node_modules", "@cmssy"), { recursive: true });
  symlinkSync(
    join(packagesDir, "core"),
    join(root, "node_modules", "@cmssy", "core"),
  );
  symlinkSync(
    join(packagesDir, "react", "node_modules", "react"),
    join(root, "node_modules", "react"),
  );
  write(
    root,
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        jsx: "preserve",
        module: "esnext",
        moduleResolution: "bundler",
        paths: { "@/*": ["./*"] },
      },
    }),
  );
  write(
    root,
    "blocks/hero/Hero.tsx",
    [
      'import "server-only";',
      'import "./hero.css";',
      'import styles from "./hero.module.css";',
      "export const publicSite = import.meta.env.PUBLIC_SITE_NAME;",
      "export const cssModule = styles;",
      'import logo from "./logo.png";',
      'import { fields } from "@cmssy/core";',
      "export const heroProps = { title: fields.text({ required: true }) };",
      "export default function Hero({ content }: { content: { title: string } }) {",
      "  return <h1 data-logo={String(logo)}>{content.title}</h1>;",
      "}",
    ].join("\n"),
  );
  write(root, "blocks/hero/hero.css", "h1 { color: red }");
  write(root, "blocks/hero/hero.module.css", ".title { color: red }");
  write(root, "blocks/hero/logo.png", "not really a png");
  write(
    root,
    "blocks/hero/block.ts",
    [
      'import Hero, { heroProps } from "./Hero";',
      'export const heroBlock = { type: "hero", label: "Hero", component: Hero, props: heroProps };',
    ].join("\n"),
  );
  write(
    root,
    "cmssy/blocks.ts",
    [
      'import { heroBlock } from "@/blocks/hero/block";',
      "export const blocks = [heroBlock];",
      'export { publicSite, cssModule } from "@/blocks/hero/Hero";',
    ].join("\n"),
  );
  write(
    root,
    "cmssy.config.ts",
    [
      'import { defineCmssyConfig, defineCmssyLayout, fields } from "@cmssy/core";',
      "export const layout = defineCmssyLayout({",
      "  regions: [",
      '    { id: "header", label: "Header" },',
      '    { id: "aside", settings: { width: fields.number({ required: true }) } },',
      "  ],",
      "});",
      "export const cmssy = defineCmssyConfig({",
      "  org: process.env.CMSSY_ORG_SLUG,",
      "  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,",
      "  draftSecret: process.env.CMSSY_DRAFT_SECRET,",
      "  layout,",
      "});",
    ].join("\n"),
  );
  return root;
}

describe("loadSiteModule", () => {
  it("bundles the registry through tsconfig paths, JSX, css and asset imports, and server-only", async () => {
    const root = scaffoldSite();

    const module = await loadSiteModule(root, "cmssy/blocks.ts");

    const blocks = module.blocks as Array<{
      type: string;
      props: Record<string, { type: string }>;
    }>;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("hero");
    expect(blocks[0]!.props.title!.type).toBe("text");
    expect(module.cssModule).toEqual({});
  });

  it("maps import.meta.env onto process.env so an Astro-style block evaluates", async () => {
    const root = scaffoldSite();
    process.env.PUBLIC_SITE_NAME = "Acme";
    try {
      const module = await loadSiteModule(root, "cmssy/blocks.ts");
      expect(module.publicSite).toBe("Acme");
    } finally {
      delete process.env.PUBLIC_SITE_NAME;
    }
  });

  it("evaluates the config with the env the command loaded, and hands back the layout", async () => {
    const root = scaffoldSite();
    process.env.CMSSY_ORG_SLUG = "acme";
    process.env.CMSSY_WORKSPACE_SLUG = "shop";
    process.env.CMSSY_DRAFT_SECRET = "a-secret-long-enough";
    try {
      const module = await loadSiteModule(root, "cmssy.config.ts");

      const layout = module.layout as { regions: Array<{ id: string }> };
      expect(layout.regions.map((region) => region.id)).toEqual([
        "header",
        "aside",
      ]);
      expect((module.cmssy as { org: string }).org).toBe("acme");
    } finally {
      delete process.env.CMSSY_ORG_SLUG;
      delete process.env.CMSSY_WORKSPACE_SLUG;
      delete process.env.CMSSY_DRAFT_SECRET;
    }
  });

  it("reports the config's own refusal when the env is missing", async () => {
    const root = scaffoldSite();
    delete process.env.CMSSY_DRAFT_SECRET;

    await expect(loadSiteModule(root, "cmssy.config.ts")).rejects.toMatchObject(
      {
        name: "CliError",
        message: "could not load cmssy.config.ts",
        fix: expect.stringContaining("CMSSY_DRAFT_SECRET"),
      },
    );
  });

  it("reports a compile error with the file and line", async () => {
    const root = scaffoldSite();
    write(root, "cmssy/broken.ts", "export const blocks = [\nexport const = ;");

    await expect(loadSiteModule(root, "cmssy/broken.ts")).rejects.toMatchObject(
      {
        name: "CliError",
        message: "could not compile cmssy/broken.ts",
        fix: expect.stringContaining("cmssy/broken.ts:2"),
      },
    );
  });
});
