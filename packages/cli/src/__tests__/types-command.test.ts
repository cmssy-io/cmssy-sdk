import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runTypes, type TypesDeps } from "../types-command";

const MODELS = [
  {
    slug: "product",
    name: "Product",
    displayField: "title",
    fields: [
      { key: "title", type: "text", required: true, localized: true },
      { key: "price", type: "number", required: true },
    ],
  },
];

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

  it("says so when the workspace has no models yet", async () => {
    const { deps, lines } = makeDeps({
      definitions: { data: { public: { model: { definitions: [] } } } },
    });
    const code = await runTypes({}, deps);
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("no models yet");
  });
});
