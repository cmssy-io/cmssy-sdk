import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { cmssyMiddleware } from "../middleware";

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

function contextFor(href: string) {
  const url = new URL(href);
  return {
    url,
    request: new Request(href),
    rewrite: vi.fn(async (path: string) => new Response(`rewritten:${path}`)),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("cmssyMiddleware", () => {
  it("tells the page which language it is rendering", async () => {
    stubSiteConfig();
    const context = contextFor("https://shop.test/no/about");
    const next = vi.fn(async () => new Response("ok"));

    await cmssyMiddleware(CONFIG)(context, next);

    expect(context.request.headers.get("x-cmssy-locale")).toBe("no");
  });

  it("routes a VERIFIED editor request to the edit page, carrying the language", async () => {
    stubSiteConfig();
    const context = contextFor(
      "https://shop.test/no/about?cmssyEdit=1&cmssySecret=draft-secret-1234",
    );
    const next = vi.fn(async () => new Response("ok"));

    const response = await cmssyMiddleware(CONFIG)(context, next);

    expect(context.rewrite).toHaveBeenCalledWith(
      expect.stringContaining("/cmssy-edit/no/about"),
    );
    expect(context.request.headers.get("x-cmssy-edit")).toBe("1");
    expect(context.request.headers.get("x-cmssy-locale")).toBe("no");
    // Without this the admin cannot frame the site and the editor shows nothing.
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors",
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("does NOT open the editor for a bare cmssyEdit=1 (CMS-948)", async () => {
    stubSiteConfig();
    const context = contextFor("https://shop.test/about?cmssyEdit=1");
    const next = vi.fn(async () => new Response("ok"));

    await cmssyMiddleware(CONFIG)(context, next);

    expect(context.rewrite).not.toHaveBeenCalled();
    expect(context.request.headers.get("x-cmssy-edit")).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  it("refuses a forged edit header from the client", async () => {
    stubSiteConfig();
    const context = contextFor("https://shop.test/about");
    context.request.headers.set("x-cmssy-edit", "1");
    const next = vi.fn(async () => new Response("ok"));

    await cmssyMiddleware(CONFIG)(context, next);

    expect(context.request.headers.get("x-cmssy-edit")).toBeNull();
  });

  it("strips the language prefix when asked, but never the default language's", async () => {
    stubSiteConfig("en", ["en", "no"]);
    const noContext = contextFor("https://shop.test/no/shop");
    await cmssyMiddleware(CONFIG, { stripLocalePrefix: true })(
      noContext,
      async () => new Response("ok"),
    );
    expect(noContext.rewrite).toHaveBeenCalledWith("/shop");

    const enContext = contextFor("https://shop.test/shop");
    const next = vi.fn(async () => new Response("ok"));
    await cmssyMiddleware(CONFIG, { stripLocalePrefix: true })(enContext, next);
    expect(enContext.rewrite).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
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

// A site that advertises localhost is worse than one with no sitemap at all:
// Google indexes nothing and you find out weeks later. Behind Vercel the
// server's own origin IS localhost, so the forwarded host is the only truth.
describe("base URL behind a proxy", () => {
  it("uses the host the visitor asked for, not the server's own origin", async () => {
    stubSiteConfig();
    const { createCmssyRobots } = await import("../seo");

    const response = await createCmssyRobots(CONFIG)({
      url: new URL("http://localhost:3000/robots.txt"),
      request: new Request("http://localhost:3000/robots.txt", {
        headers: { "x-forwarded-host": "shop.example.com" },
      }),
    });
    const body = await response.text();

    expect(body).toContain("Sitemap: https://shop.example.com/sitemap.xml");
    expect(body).not.toContain("localhost");
  });
});
