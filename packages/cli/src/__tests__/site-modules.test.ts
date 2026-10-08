import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { findFrameworkStubValues, loadSiteModule } from "../site-modules";

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

  it("loads a registry whose blocks import framework modules Node cannot resolve", async () => {
    const root = scaffoldSite();
    write(
      root,
      "blocks/promo/Promo.tsx",
      [
        'import NextImage from "next/image";',
        'import { Inter } from "next/font/google";',
        'import { useRouter } from "next/navigation";',
        'const inter = Inter({ subsets: ["latin"] });',
        'import { fields } from "@cmssy/core";',
        "export const promoProps = { text: fields.text({ required: true }) };",
        "export default function Promo({ content }: { content: { text: string } }) {",
        "  void useRouter;",
        "  return <p className={String(inter)}><NextImage alt='' src='/x.png' width={1} height={1} />{content.text}</p>;",
        "}",
      ].join("\n"),
    );
    write(
      root,
      "blocks/promo/block.ts",
      [
        'import Promo, { promoProps } from "./Promo";',
        'export const promoBlock = { type: "promo", label: "Promo", component: Promo, props: promoProps };',
      ].join("\n"),
    );
    write(
      root,
      "cmssy/next-blocks.ts",
      [
        'import { promoBlock } from "@/blocks/promo/block";',
        "export const blocks = [promoBlock];",
      ].join("\n"),
    );

    const module = await loadSiteModule(root, "cmssy/next-blocks.ts");

    const blocks = module.blocks as Array<{
      type: string;
      props: Record<string, { type: string }>;
    }>;
    expect(
      blocks.map((block) => block.type),
      "a block importing next/image, next/font/google or next/navigation must still load for schema extraction - Next 16 exposes none of them through its exports map, so an external import crashes bare Node",
    ).toEqual(["promo"]);
    expect(blocks[0]!.props.text!.type).toBe("text");
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

describe("framework stubs", () => {
  it("evaluates framework values used in module-scope string and destructuring expressions", async () => {
    const root = scaffoldSite();
    write(
      root,
      "cmssy/expr-blocks.ts",
      [
        'import { Inter } from "next/font/google";',
        'import { headers } from "next/headers";',
        'const inter = Inter({ subsets: ["latin"] });',
        'export const badgeClass = "font-" + inter.className;',
        "const [firstHeader] = headers();",
        "export const first = firstHeader;",
        'export const blocks = [{ type: "badge", label: "Badge", component: () => null, props: {} }];',
      ].join("\n"),
    );

    const module = await loadSiteModule(root, "cmssy/expr-blocks.ts");

    expect(Object.keys(module)).toContain("first");
    expect(
      module.badgeClass,
      "string concatenation with a stubbed framework value must yield the empty string - without a Symbol.toPrimitive handler the proxy throws 'Cannot convert object to primitive value' at import time",
    ).toBe("font-");
    expect(
      module.first,
      "destructuring a stubbed framework call must yield undefined - without a Symbol.iterator handler the proxy throws 'is not iterable' at import time",
    ).toBeUndefined();
  });

  it("loads a block that imports a .astro component", async () => {
    const root = scaffoldSite();
    write(root, "blocks/astro-hero/Hero.astro", "---\n---\n<h1>hi</h1>");
    write(
      root,
      "blocks/astro-hero/block.ts",
      [
        'import Hero from "./Hero.astro";',
        'export const astroHeroBlock = { type: "astroHero", label: "Astro hero", component: Hero, props: {} };',
      ].join("\n"),
    );
    write(
      root,
      "cmssy/astro-blocks.ts",
      [
        'import { astroHeroBlock } from "@/blocks/astro-hero/block";',
        "export const blocks = [astroHeroBlock];",
      ].join("\n"),
    );

    const module = await loadSiteModule(root, "cmssy/astro-blocks.ts");

    expect(
      (module.blocks as Array<{ type: string }>).map((block) => block.type),
      "the Astro docs offer .astro components for blocks - without an empty loader for the extension esbuild refuses the whole registry with 'No loader is configured'",
    ).toEqual(["astroHero"]);
  });

  it("names the framework hop when a dependency imports next/* at load time", async () => {
    const root = scaffoldSite();
    write(
      root,
      "node_modules/next/package.json",
      JSON.stringify({
        name: "next",
        version: "16.0.0",
        exports: { ".": "./index.js" },
      }),
    );
    write(root, "node_modules/next/index.js", "module.exports = {};");
    write(
      root,
      "node_modules/uses-next/package.json",
      JSON.stringify({
        name: "uses-next",
        version: "1.0.0",
        type: "module",
        exports: { ".": "./index.js" },
      }),
    );
    write(
      root,
      "node_modules/uses-next/index.js",
      'export { useRouter } from "next/navigation";',
    );
    write(
      root,
      "cmssy/transitive-blocks.ts",
      [
        'import { useRouter } from "uses-next";',
        "export const r = useRouter;",
        'export const blocks = [{ type: "t", label: "T", component: () => null, props: {} }];',
      ].join("\n"),
    );

    await expect(
      loadSiteModule(root, "cmssy/transitive-blocks.ts"),
    ).rejects.toMatchObject({
      name: "CliError",
      message: "could not load cmssy/transitive-blocks.ts",
      fix: expect.stringContaining(
        "cmssy stubs framework imports in your own files",
      ),
    });
  });

  it("brands stubbed framework values so the manifest gate can find them", async () => {
    const root = scaffoldSite();
    write(
      root,
      "cmssy/stub-default-blocks.ts",
      [
        'import { Inter } from "next/font/google";',
        'import { fields } from "@cmssy/core";',
        'const inter = Inter({ subsets: ["latin"] });',
        'export const blocks = [{ type: "badge", label: "Badge", component: () => null, props: { caption: { ...fields.text({ label: "Caption" }), default: inter.className } } }];',
      ].join("\n"),
    );

    const module = await loadSiteModule(root, "cmssy/stub-default-blocks.ts");

    expect(
      findFrameworkStubValues(module.blocks),
      "a framework value assigned into a block schema is silently dropped by JSON.stringify when the manifest is saved - the stub must carry the __cmssyFrameworkStub brand so collectManifest can refuse it by name",
    ).toEqual(["[0].props.caption.default"]);
  });
});
