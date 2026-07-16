import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createCmssyHeaders, createCmssyLoader } from "../loader";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CONFIG = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
  draftSecret: "draft-secret-1234",
} as never;

/** Answers the site-config lookup, then every page/layout read with an empty page. */
function stubApi() {
  const calls: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as {
        query: string;
        variables: Record<string, unknown>;
      };
      calls.push(body.variables);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            public: {
              siteConfig: {
                workspaceId: "6a4366000000000000000000",
                defaultLanguage: "en",
                enabledLanguages: ["en", "no"],
              },
              page: null,
              layouts: [],
            },
          },
        }),
      };
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("createCmssyLoader", () => {
  it("reads the language off the path - the prefix IS the language", async () => {
    stubApi();
    const data = await createCmssyLoader(CONFIG)({
      request: new Request("https://shop.test/no/about"),
    });

    expect(data.locale).toBe("no");
    expect(data.isEdit).toBe(false);
  });

  it("enters edit mode for a verified editor request", async () => {
    stubApi();
    const data = await createCmssyLoader(CONFIG)({
      request: new Request(
        "https://shop.test/about?cmssyEdit=1&cmssySecret=draft-secret-1234",
      ),
    });

    expect(data.isEdit).toBe(true);
  });

  // The same rule as everywhere else, and the reason it exists: a bare
  // cmssyEdit=1 would let anyone read drafts and mount the editable UI.
  it("does NOT enter edit mode for a bare cmssyEdit=1 (CMS-948)", async () => {
    stubApi();
    const data = await createCmssyLoader(CONFIG)({
      request: new Request("https://shop.test/about?cmssyEdit=1"),
    });

    expect(data.isEdit).toBe(false);
  });

  it("rejects a wrong secret", async () => {
    stubApi();
    const data = await createCmssyLoader(CONFIG)({
      request: new Request(
        "https://shop.test/about?cmssyEdit=1&cmssySecret=wrong",
      ),
    });

    expect(data.isEdit).toBe(false);
  });

  it("returns diagnostics in development for a wrong cmssySecret", async () => {
    vi.stubEnv("NODE_ENV", "development");
    stubApi();
    const data = await createCmssyLoader(CONFIG)({
      request: new Request(
        "https://shop.test/about?cmssyEdit=1&cmssySecret=wrong",
      ),
    });

    expect(data.isEdit).toBe(false);
    expect(data.page).toBeNull();
    expect(data.diagnostics).toContain("cmssy editor diagnostics");
    expect(data.diagnostics).toContain("acme/ws");
    expect(data.diagnostics).toContain("frame-ancestors");
    expect(data.diagnostics).not.toContain("draft-secret-1234");
  });

  it("returns no diagnostics in production for a wrong cmssySecret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    stubApi();
    const data = await createCmssyLoader(CONFIG)({
      request: new Request(
        "https://shop.test/about?cmssyEdit=1&cmssySecret=wrong",
      ),
    });

    expect(data.isEdit).toBe(false);
    expect(data.diagnostics).toBeUndefined();
  });

  it("still enters edit mode in development with the right secret", async () => {
    vi.stubEnv("NODE_ENV", "development");
    stubApi();
    const data = await createCmssyLoader(CONFIG)({
      request: new Request(
        "https://shop.test/about?cmssyEdit=1&cmssySecret=draft-secret-1234",
      ),
    });

    expect(data.isEdit).toBe(true);
    expect(data.diagnostics).toBeUndefined();
  });

  it("serves the framing CSP - without it the editor is an empty box", () => {
    const headers = createCmssyHeaders(CONFIG)();

    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors");
  });
});

// The reason this package exists at all. If the React Router adapter reaches for
// Next, then @cmssy/core is not framework-agnostic and the layering is a story
// we tell ourselves.
describe("framework boundary", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        return entry === "__tests__" ? [] : sourceFiles(path);
      }
      return path.endsWith(".ts") ? [path] : [];
    });
  }

  it("imports neither Next nor a Node built-in", () => {
    const offenders = sourceFiles(SRC).filter((file) =>
      /from\s+["'](next|astro|(node:)?(crypto|fs|path|http))(\/|["'])/.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(offenders).toEqual([]);
  });
});
