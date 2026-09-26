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

import { runTypes, type TypesDeps } from "../types-command";

const OLD_PREAMBLE = `/** A translatable field: one string, or one per enabled language. */
export type CmssyLocalized = string | Record<string, string>;

/**
 * What a media field reads back. Mirrors \`ResolvedMedia\` in @cmssy/types.
 * A single media field is \`CmssyMedia | null\`: a reference whose asset was
 * deleted resolves to nothing. A gallery drops such entries instead.
 */
export interface CmssyMedia {
  id: string;
  url: string | null;
  visibility: "public" | "private";
  alt?: string;
  width?: number;
  height?: number;
}

/** What a file field holds. Mirrors \`FileFieldValue\` in @cmssy/types. */
export type CmssyFile = string;

/** A record as \`public.model.records\` returns it, with \`data\` typed. */
export interface CmssyRecordOf<Data> {
  id: string;
  modelId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  data: Data;
}`;

const PRODUCT = {
  slug: "product",
  name: "Product",
  displayField: "title",
  fields: [
    { key: "title", type: "text", required: true, localized: true },
    { key: "price", type: "number", required: true },
  ],
};

const MODELS = [PRODUCT];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

interface Recorded {
  url: string;
  body: { query: string; variables: Record<string, unknown> };
}

function makeDeps(
  overrides: {
    env?: Record<string, string | undefined>;
    siteConfig?: unknown;
    definitions?: unknown;
    status?: number;
  } = {},
): { deps: TypesDeps; lines: string[]; calls: Recorded[]; cwd: string } {
  const cwd = mkdtempSync(join(tmpdir(), "cmssy-types-"));
  const lines: string[] = [];
  const calls: Recorded[] = [];
  const deps: TypesDeps = {
    cwd,
    env: overrides.env ?? {
      CMSSY_ORG_SLUG: "acme",
      CMSSY_WORKSPACE_SLUG: "shop",
    },
    log: (line) => lines.push(line),
    fetch: (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Recorded["body"];
      calls.push({ url: String(url), body });
      if (overrides.status && overrides.status !== 200) {
        return new Response("nope", { status: overrides.status });
      }
      if (body.query.includes("CliSiteConfig")) {
        return jsonResponse(
          overrides.siteConfig ?? {
            data: { public: { siteConfig: { workspaceId: "ws_1" } } },
          },
        );
      }
      return jsonResponse(
        overrides.definitions ?? {
          data: { public: { model: { definitions: MODELS } } },
        },
      );
    }) as unknown as typeof globalThis.fetch,
  };
  return { deps, lines, calls, cwd };
}

describe("runTypes", () => {
  it("writes the generated types and reports what it found", async () => {
    const { deps, lines, cwd } = makeDeps();
    const code = await runTypes({}, deps);

    expect(code).toBe(0);
    const written = readFileSync(join(cwd, "cmssy/models.ts"), "utf8");
    expect(written).toContain("export interface ProductData");
    expect(written).toContain("title: CmssyLocalized;");
    expect(lines.join("\n")).toContain("1 model, 2 fields");
  });

  it("reads the workspace off the org-scoped public path", async () => {
    const { deps, calls } = makeDeps();
    await runTypes({}, deps);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://api.cmssy.io/public/acme/shop/graphql");
    expect(calls[1]?.body.variables).toEqual({ workspaceId: "ws_1" });
  });

  it("writes an absolute --out where it says, not under the app", async () => {
    const { deps, lines, cwd } = makeDeps();
    const target = join(mkdtempSync(join(tmpdir(), "cmssy-out-")), "models.ts");

    await runTypes({ out: target }, deps);

    expect(readFileSync(target, "utf8")).toContain("ProductData");
    expect(existsSync(join(cwd, target))).toBe(false);
    expect(lines.join("\n")).toContain(target);
  });

  it("honours --out", async () => {
    const { deps, cwd } = makeDeps();
    await runTypes({ out: "types/models.ts" }, deps);
    expect(readFileSync(join(cwd, "types/models.ts"), "utf8")).toContain(
      "ProductData",
    );
  });

  it("takes the slugs from an env file when the process has none", async () => {
    const { deps, calls, cwd } = makeDeps({ env: {} });
    writeFileSync(
      join(cwd, ".env.local"),
      "CMSSY_ORG_SLUG=from-file\nCMSSY_WORKSPACE_SLUG=site\n",
    );
    const code = await runTypes({}, deps);
    expect(code).toBe(0);
    expect(calls[0]?.url).toContain("/public/from-file/site/graphql");
  });

  it("does not rewrite an identical file", async () => {
    const { deps, lines } = makeDeps();
    await runTypes({}, deps);
    await runTypes({}, deps);
    expect(lines.join("\n")).toContain("is up to date");
  });

  it("fails with a hint when the workspace is unknown", async () => {
    const { deps, lines } = makeDeps({ env: {} });
    const code = await runTypes({}, deps);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("CMSSY_ORG_SLUG is not set");
    expect(lines.join("\n")).toContain("cmssy link");
  });

  it("reports a delivery API error instead of writing a broken file", async () => {
    const { deps, lines } = makeDeps({
      definitions: { errors: [{ message: "boom" }] },
    });
    const code = await runTypes({}, deps);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("boom");
  });

  describe("--check", () => {
    it("passes when the file matches the workspace", async () => {
      const { deps, lines } = makeDeps();
      await runTypes({}, deps);

      const code = await runTypes({ check: true }, deps);

      expect(code).toBe(0);
      expect(lines.join("\n")).toContain("is up to date");
    });

    it("fails, names the drift and writes nothing when a model changed", async () => {
      const { deps, lines, cwd } = makeDeps();
      await runTypes({}, deps);
      const before = readFileSync(join(cwd, "cmssy/models.ts"), "utf8");

      const drifted = makeDeps({
        definitions: {
          data: {
            public: {
              model: {
                definitions: [
                  {
                    ...PRODUCT,
                    fields: [
                      ...PRODUCT.fields,
                      { key: "sku", type: "text", required: true },
                    ],
                  },
                  { slug: "review", fields: [{ key: "body", type: "text" }] },
                ],
              },
            },
          },
        },
      });
      drifted.deps.cwd = cwd;

      const code = await runTypes({ check: true }, drifted.deps);

      expect(code).toBe(1);
      const output = drifted.lines.join("\n");
      expect(output).toContain("out of date");
      expect(output).toContain("+ models: Review");
      expect(output).toMatch(/^ {2}\+ fields: sku, body$/m);
      expect(output).toContain("run `cmssy types`");
      expect(readFileSync(join(cwd, "cmssy/models.ts"), "utf8")).toBe(before);
    });

    it("blames only the workspace, never the preamble, when the CLI's own header changed", async () => {
      const { deps, cwd } = makeDeps();
      await runTypes({}, deps);
      const outPath = join(cwd, "cmssy/models.ts");
      const current = readFileSync(outPath, "utf8");
      const preamble = current.slice(
        current.indexOf("import type {"),
        current.search(/\n\/\*\*\n \* [A-Z]/),
      );
      expect(preamble).toContain("@cmssy/core");
      expect(preamble).not.toContain("export interface ProductData");
      writeFileSync(
        outPath,
        current.replace(preamble, OLD_PREAMBLE),
      );

      const checked = makeDeps();
      checked.deps.cwd = cwd;
      const code = await runTypes({ check: true }, checked.deps);

      expect(code).toBe(1);
      const output = checked.lines.join("\n");
      expect(output).toContain("out of date");
      expect(output).not.toMatch(/^\s*[+-] fields:/m);
      expect(output).not.toMatch(/^\s*[+-] models:/m);
      expect(output).toContain("the generated output differs");
    });

    it("fails when the file was never generated", async () => {
      const { deps, lines } = makeDeps();

      const code = await runTypes({ check: true }, deps);

      expect(code).toBe(1);
      expect(lines.join("\n")).toContain("is missing");
    });
  });

  describe("the installed @cmssy/core", () => {
    const ALL_SHAPES = [
      "CmssyLocalizedValue",
      "ResolvedMedia",
      "FileFieldValue",
      "CmssyModelRecord",
    ];

    const installCore = (
      root: string,
      version: string,
      exported: string[],
      options: { types?: string | null; declarations?: string } = {},
    ) => {
      const pkg = join(root, "node_modules/@cmssy/core");
      mkdirSync(join(pkg, "dist"), { recursive: true });
      const manifest: Record<string, string> = { name: "@cmssy/core", version };
      if (options.types !== null) manifest.types = options.types ?? "./dist/index.d.ts";
      writeFileSync(join(pkg, "package.json"), JSON.stringify(manifest));
      writeFileSync(
        join(pkg, "dist/index.d.ts"),
        options.declarations ??
          `export { ${exported.join(", ")} } from '@cmssy/types';\n`,
      );
    };

    it("is named in the warning when it predates the shapes the preamble imports", async () => {
      const { deps, lines, cwd } = makeDeps();
      installCore(cwd, "16.6.0", [
        "CmssyLocalizedValue",
        "CmssyModelRecord",
        "ResolvedMediaValue",
      ]);

      const code = await runTypes({}, deps);

      expect(code).toBe(0);
      const output = lines.join("\n");
      expect(output).toContain("@cmssy/core 16.6.0 does not export");
      expect(output).toContain("ResolvedMedia");
      expect(output).toContain("FileFieldValue");
      expect(output).not.toContain("CmssyLocalizedValue does not");
      expect(output).toMatch(/upgrade @cmssy\/core to \d+\.\d+\.\d+ or newer/);
    });

    it("draws no warning when it exports every shape", async () => {
      const { deps, lines, cwd } = makeDeps();
      installCore(cwd, "16.12.0", [
        "CmssyLocalizedValue",
        "ResolvedMedia",
        "FileFieldValue",
        "CmssyModelRecord",
      ]);

      const code = await runTypes({}, deps);

      expect(code).toBe(0);
      expect(lines.join("\n")).not.toContain("does not export");
    });

    it("names it under --check too, which is the run CI makes", async () => {
      const { deps, lines, cwd } = makeDeps();
      installCore(cwd, "16.6.0", ["CmssyLocalizedValue", "CmssyModelRecord"]);

      const code = await runTypes({ check: true }, deps);

      expect(code).toBe(1);
      const output = lines.join("\n");
      expect(output).toContain("@cmssy/core 16.6.0 does not export");
      expect(output).toContain("is missing");
    });

    it("names it when the generated file is already up to date", async () => {
      const first = makeDeps();
      await runTypes({}, first.deps);
      installCore(first.cwd, "16.6.0", ["CmssyLocalizedValue", "CmssyModelRecord"]);

      const again = makeDeps();
      again.deps.cwd = first.cwd;
      const code = await runTypes({}, again.deps);

      expect(code).toBe(0);
      const output = again.lines.join("\n");
      expect(output).toContain("is up to date");
      expect(output).toContain("@cmssy/core 16.6.0 does not export");
    });

    it("finds a core hoisted to a parent node_modules", async () => {
      const { deps, lines, cwd } = makeDeps();
      const app = join(cwd, "apps/web");
      mkdirSync(app, { recursive: true });
      deps.cwd = app;
      installCore(cwd, "16.6.0", ["CmssyLocalizedValue", "CmssyModelRecord"]);

      const code = await runTypes({}, deps);

      expect(code).toBe(0);
      expect(lines.join("\n")).toContain("@cmssy/core 16.6.0 does not export");
    });

    it("reads the declarations even when the manifest has no types entry", async () => {
      const { deps, lines, cwd } = makeDeps();
      installCore(cwd, "16.6.0", ["CmssyLocalizedValue", "CmssyModelRecord"], {
        types: null,
      });

      const code = await runTypes({}, deps);

      expect(code).toBe(0);
      expect(lines.join("\n")).toContain("@cmssy/core 16.6.0 does not export");
    });

    it("does not count a name the declarations only import or mention", async () => {
      const { deps, lines, cwd } = makeDeps();
      installCore(cwd, "16.6.0", [], {
        declarations: [
          "import { ResolvedMedia, CmssyModelRecord } from '@cmssy/types';",
          "/** FileFieldValue is what a file field holds. */",
          "// CmssyLocalizedValue is a locale map.",
          "export declare function mediaUrl(value: ResolvedMedia): string;",
          "",
        ].join("\n"),
      });

      const code = await runTypes({}, deps);

      expect(code).toBe(0);
      const output = lines.join("\n");
      expect(output).toContain("@cmssy/core 16.6.0 does not export");
      for (const name of ALL_SHAPES) expect(output).toContain(name);
    });

    it("reads the exported name, not the local one, through an alias", async () => {
      const { deps, lines, cwd } = makeDeps();
      installCore(cwd, "16.12.0", [], {
        declarations: [
          "export { a as CmssyLocalizedValue, b as ResolvedMedia } from './chunk.js';",
          "export { c as FileFieldValue, d as CmssyModelRecord } from './chunk.js';",
          "",
        ].join("\n"),
      });

      const code = await runTypes({}, deps);

      expect(code).toBe(0);
      expect(lines.join("\n")).not.toContain("does not export");
    });

    it("accepts shapes the declarations declare rather than re-export", async () => {
      const { deps, lines, cwd } = makeDeps();
      installCore(cwd, "16.12.0", [], {
        declarations: [
          "export declare type CmssyLocalizedValue = Record<string, string> | string | null;",
          "export interface ResolvedMedia { id: string }",
          "export declare type FileFieldValue = string;",
          "export interface CmssyModelRecord { id: string }",
          "",
        ].join("\n"),
      });

      const code = await runTypes({}, deps);

      expect(code).toBe(0);
      expect(lines.join("\n")).not.toContain("does not export");
    });

    it("does not accept an export that only appears inside a comment", async () => {
      const { deps, lines, cwd } = makeDeps();
      installCore(cwd, "16.12.0", [], {
        declarations: [
          "/**",
          " * Removed in 17. It used to be:",
          " * export { CmssyLocalizedValue, ResolvedMedia } from '@cmssy/types';",
          " * export { FileFieldValue, CmssyModelRecord } from '@cmssy/types';",
          " */",
          "export declare function mediaUrl(value: unknown): string;",
          "",
        ].join("\n"),
      });

      const code = await runTypes({}, deps);

      expect(code).toBe(0);
      const output = lines.join("\n");
      expect(output).toContain("@cmssy/core 16.12.0 does not export");
      for (const name of ALL_SHAPES) expect(output).toContain(name);
    });

    it("stays quiet when the declarations file is unreadable", async () => {
      const { deps, lines, cwd } = makeDeps();
      installCore(cwd, "16.6.0", [], { types: "./dist/gone.d.ts" });

      const code = await runTypes({}, deps);

      expect(code).toBe(0);
      expect(lines.join("\n")).not.toContain("does not export");
    });

    it("stays quiet when the package is not installed at all", async () => {
      const { deps, lines } = makeDeps();

      const code = await runTypes({}, deps);

      expect(code).toBe(0);
      expect(lines.join("\n")).not.toContain("does not export");
    });
  });

  it("says so when the workspace has no models yet", async () => {
    const { deps, lines } = makeDeps({
      definitions: { data: { public: { model: { definitions: [] } } } },
    });
    const code = await runTypes({}, deps);
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("no models yet");
  });
});
