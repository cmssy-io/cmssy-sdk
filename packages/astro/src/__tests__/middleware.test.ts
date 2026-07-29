import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { cmssyMiddleware } from "../middleware";

const CMSSY_LOCALE_HEADER = "x-cmssy-locale";
const CMSSY_EDIT_HEADER = "x-cmssy-edit";

/** `resolveSiteLocales` caches per workspace, so a shared slug leaks a stub. */
const configFor = (workspaceSlug: string) =>
  ({
    apiUrl: "https://api.test/graphql",
    org: "acme",
    workspaceSlug,
    draftSecret: "draft-secret-1234",
  }) as never;

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CONFIG = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
  draftSecret: "draft-secret-1234",
} as never;

/** The site config call the locale lookup makes; anything else is a test bug. */
function stubSiteConfig(defaultLanguage = "en", enabled = ["en", "no"]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          public: {
            siteConfig: {
              workspaceId: "6a4366000000000000000000",
              defaultLanguage,
              enabledLanguages: enabled,
            },
          },
        },
      }),
    })),
  );
}

/**
 * `context.rewrite` throws here on purpose. Both it and `next(payload)` reach
 * `applyRewriteToState`, but `context.rewrite` builds a fresh `AstroMiddleware`
 * and runs the chain again on the rewritten URL - the second pass this file
 * exists to keep from coming back.
 */
function contextFor(href: string) {
  const url = new URL(href);
  return {
    url,
    request: new Request(href),
    rewrite: vi.fn(() => {
      throw new Error("context.rewrite re-runs the middleware; use next()");
    }),
  };
}

interface MiddlewareRun {
  /** What the middleware handed `next`, if anything. */
  routedTo: string | null;
  locale: string | null;
  edit: string | null;
  response: Response;
}

async function run(
  middleware: (context: never, next: never) => Promise<Response>,
  href: string,
  headers: Record<string, string> = {},
): Promise<MiddlewareRun> {
  const context = contextFor(href);
  for (const [name, value] of Object.entries(headers)) {
    context.request.headers.set(name, value);
  }

  let routedTo: string | null = null;
  const next = async (payload?: string | URL | Request) => {
    if (payload !== undefined) {
      routedTo =
        payload instanceof Request
          ? new URL(payload.url).pathname + new URL(payload.url).search
          : String(payload);
    }
    return new Response("page");
  };

  const response = await middleware(context as never, next as never);
  return {
    routedTo,
    locale: context.request.headers.get(CMSSY_LOCALE_HEADER),
    edit: context.request.headers.get(CMSSY_EDIT_HEADER),
    response,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("cmssyMiddleware", () => {
  it("tells the page which language it is rendering", async () => {
    stubSiteConfig();

    const result = await run(
      cmssyMiddleware(configFor("lang")) as never,
      "https://shop.test/no/about",
    );

    expect(result.locale).toBe("no");
  });

  it("routes a VERIFIED editor request to the edit page, carrying the language", async () => {
    stubSiteConfig();

    const result = await run(
      cmssyMiddleware(configFor("edit")) as never,
      "https://shop.test/no/about?cmssyEdit=1&cmssySecret=draft-secret-1234",
    );

    expect(result.routedTo).toBe(
      "/cmssy-edit/no/about?cmssyEdit=1&cmssySecret=draft-secret-1234",
    );
    expect(result.edit).toBe("1");
    expect(result.locale).toBe("no");
    // Without this the admin cannot frame the site and the editor shows nothing.
    expect(result.response.headers.get("content-security-policy")).toContain(
      "frame-ancestors",
    );
  });

  it("sends the CSP on a direct hit of the edit route too (CMS-1096)", async () => {
    stubSiteConfig();

    const verified = await run(
      cmssyMiddleware({
        ...(configFor("directedit") as object),
        editorOrigin: ["https://cmssy.io", "https://www.cmssy.io"],
      } as never) as never,
      "https://shop.test/cmssy-edit/about?cmssyEdit=1&cmssySecret=draft-secret-1234",
    );
    expect(verified.response.headers.get("content-security-policy")).toContain(
      "frame-ancestors https://cmssy.io https://www.cmssy.io",
    );

    const bare = await run(
      cmssyMiddleware({
        ...(configFor("directbare") as object),
        editorOrigin: "https://www.cmssy.io",
      } as never) as never,
      "https://shop.test/cmssy-edit/about",
    );
    expect(bare.response.headers.get("content-security-policy")).toContain(
      "frame-ancestors https://www.cmssy.io",
    );
  });

  it("denies framing rather than throwing when the edit-route CSP cannot be built (CMS-1096)", async () => {
    stubSiteConfig();

    const result = await run(
      cmssyMiddleware({
        ...(configFor("directbad") as object),
        editorOrigin: "cmssy.io",
      } as never) as never,
      "https://shop.test/cmssy-edit/about",
    );

    expect(result.response.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'none'",
    );
    expect(result.response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("does NOT open the editor for a bare cmssyEdit=1 (CMS-948)", async () => {
    stubSiteConfig();

    const result = await run(
      cmssyMiddleware(configFor("bare")) as never,
      "https://shop.test/about?cmssyEdit=1",
    );

    expect(result.routedTo).toBeNull();
    expect(result.edit).toBeNull();
  });

  it("refuses a forged edit header from the client", async () => {
    stubSiteConfig();

    const result = await run(
      cmssyMiddleware(configFor("forged")) as never,
      "https://shop.test/about",
      { "x-cmssy-edit": "1" },
    );

    expect(result.edit).toBeNull();
  });

  it("renders diagnostics in development for a wrong cmssySecret", async () => {
    vi.stubEnv("NODE_ENV", "development");
    stubSiteConfig();

    const result = await run(
      cmssyMiddleware(CONFIG) as never,
      "https://shop.test/about?cmssyEdit=1&cmssySecret=wrong",
    );

    expect(result.response.headers.get("content-type")).toContain("text/html");
    const body = await result.response.text();
    expect(body).toContain("cmssy editor diagnostics");
    expect(body).toContain("acme/ws");
    expect(body).toContain("frame-ancestors");
    expect(body).not.toContain("draft-secret-1234");
    // Diagnostics the admin cannot frame are a blank iframe - the symptom they
    // exist to explain.
    expect(result.response.headers.get("content-security-policy")).toContain(
      "frame-ancestors",
    );
    expect(result.routedTo).toBeNull();
  });

  it("keeps the production behavior for a wrong cmssySecret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    stubSiteConfig();

    const result = await run(
      cmssyMiddleware(configFor("prodwrong")) as never,
      "https://shop.test/about?cmssyEdit=1&cmssySecret=wrong",
    );

    expect(result.routedTo).toBeNull();
    expect(result.edit).toBeNull();
  });

  it("still routes a verified editor request in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    stubSiteConfig();

    const result = await run(
      cmssyMiddleware(configFor("devedit")) as never,
      "https://shop.test/about?cmssyEdit=1&cmssySecret=draft-secret-1234",
    );

    expect(result.routedTo).toBe(
      "/cmssy-edit/about?cmssyEdit=1&cmssySecret=draft-secret-1234",
    );
    expect(result.edit).toBe("1");
  });

  it("strips the language prefix when asked, but never the default language's", async () => {
    stubSiteConfig("en", ["en", "no"]);

    const prefixed = await run(
      cmssyMiddleware(configFor("strip"), { stripLocalePrefix: true }) as never,
      "https://shop.test/no/shop",
    );
    expect(prefixed.routedTo).toBe("/shop");
    expect(prefixed.locale).toBe("no");

    const bare = await run(
      cmssyMiddleware(configFor("strip"), { stripLocalePrefix: true }) as never,
      "https://shop.test/shop",
    );
    expect(bare.routedTo).toBeNull();
    expect(bare.locale).toBe("en");
  });

  it("strips the prefix without eating the page's own slug", async () => {
    // Measured on a built Astro 7 app: routing twice - once per middleware pass
    // - served /vember for this URL, and 508 for the one below.
    stubSiteConfig("en", ["en", "no"]);

    const result = await run(
      cmssyMiddleware(configFor("november"), {
        stripLocalePrefix: true,
      }) as never,
      "https://shop.test/no/november",
    );

    expect(result.routedTo).toBe("/november");
    expect(result.locale).toBe("no");
  });

  it("survives a page slugged like its own language", async () => {
    stubSiteConfig("en", ["en", "no"]);

    const result = await run(
      cmssyMiddleware(configFor("nono"), { stripLocalePrefix: true }) as never,
      "https://shop.test/no/no/nope",
    );

    expect(result.routedTo).toBe("/no/nope");
    expect(result.locale).toBe("no");
  });

  it("leaves a path that merely starts with the language alone", async () => {
    stubSiteConfig("en", ["en", "no"]);

    const result = await run(
      cmssyMiddleware(configFor("nope"), { stripLocalePrefix: true }) as never,
      "https://shop.test/nope",
    );

    expect(result.routedTo).toBeNull();
    expect(result.locale).toBe("en");
  });

  it("never routes to a protocol-relative path", async () => {
    // `//evil.com/x` resolves to a URL on THAT origin, and the render would run
    // there. Astro collapses the slashes itself only from 6.1, so leaving it to
    // Astro reopens this across the whole supported range.
    stubSiteConfig("en", ["en", "no"]);

    const result = await run(
      cmssyMiddleware(configFor("slashes"), {
        stripLocalePrefix: true,
      }) as never,
      "https://shop.test/no//evil.com/pwned",
    );

    expect(result.routedTo).toBe("/evil.com/pwned");
    expect(new URL(String(result.routedTo), "https://shop.test").origin).toBe(
      "https://shop.test",
    );
  });

  it("collapses a doubled slash inside the path too", async () => {
    stubSiteConfig("en", ["en", "no"]);

    const result = await run(
      cmssyMiddleware(configFor("innerslash"), {
        stripLocalePrefix: true,
      }) as never,
      "https://shop.test/no/a//b",
    );

    expect(result.routedTo).toBe("/a/b");
  });

  it("renders diagnostics even when the editorOrigin cannot build a CSP", async () => {
    vi.stubEnv("NODE_ENV", "development");
    stubSiteConfig();

    const result = await run(
      cmssyMiddleware({
        apiUrl: "https://api.test/graphql",
        org: "acme",
        workspaceSlug: "badorigin",
        draftSecret: "draft-secret-1234",
        editorOrigin: "cmssy.io",
      } as never) as never,
      "https://shop.test/about?cmssyEdit=1&cmssySecret=wrong",
    );

    // A malformed editorOrigin is one of the things this page reports; a 500
    // replaces the explanation with nothing.
    expect(result.response.status).toBe(200);
    expect(await result.response.text()).toContain("cmssy editor diagnostics");
  });

  it("edits a page whose slug starts with the edit prefix", async () => {
    // `/cmssy-editorial` is a page, not the edit route.
    stubSiteConfig();

    const result = await run(
      cmssyMiddleware(configFor("editorial")) as never,
      "https://shop.test/cmssy-editorial?cmssyEdit=1&cmssySecret=draft-secret-1234",
    );

    expect(result.routedTo).toBe(
      "/cmssy-edit/cmssy-editorial?cmssyEdit=1&cmssySecret=draft-secret-1234",
    );
    expect(result.edit).toBe("1");
  });

  it("carries the query string across the strip", async () => {
    stubSiteConfig("en", ["en", "no"]);

    const result = await run(
      cmssyMiddleware(configFor("query"), { stripLocalePrefix: true }) as never,
      "https://shop.test/no/shop?page=2",
    );

    expect(result.routedTo).toBe("/shop?page=2");
  });

  it("routes the language root to the site root", async () => {
    stubSiteConfig("en", ["en", "no"]);

    const result = await run(
      cmssyMiddleware(configFor("root"), { stripLocalePrefix: true }) as never,
      "https://shop.test/no",
    );

    expect(result.routedTo).toBe("/");
    expect(result.locale).toBe("no");
  });
});

// The reason this package exists. If the Astro adapter reaches for React or
// Next, then @cmssy/core is not framework-agnostic - it is Next's data layer
// with a second consumer, and "headless for any frontend" is a slogan again.
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

  it("imports neither React nor Next", () => {
    const offenders = sourceFiles(SRC).filter((file) =>
      /from\s+["'](react|react-dom|next)(\/|["'])/.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(offenders).toEqual([]);
  });
});
