import { afterEach, describe, expect, it, vi } from "vitest";
import { createCmssyRobots } from "../create-cmssy-robots";
import { createCmssySitemap } from "../create-cmssy-sitemap";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  workspaceSlug: "cmssy",
  draftSecret: "draft-secret-1234",
  editorOrigin: "https://app.cmssy.io",
  siteUrl: "https://cmssy.com",
  defaultLocale: "en",
  enabledLocales: ["en", "pl"],
};

/** A globalThis.fetch stub yielding the given GraphQL payload. */
function stubFetch(payload: unknown, ok = true) {
  const fetchStub = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  }));
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

afterEach(() => vi.unstubAllGlobals());

describe("createCmssyRobots", () => {
  it("allows crawling, disallows /api/, and references the sitemap", async () => {
    const result = await createCmssyRobots(CONFIG)();
    expect(result.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    });
    expect(result.sitemap).toBe("https://cmssy.com/sitemap.xml");
    expect(result.host).toBe("https://cmssy.com");
  });

  it("honours a baseUrl override and trims a trailing slash", async () => {
    const result = await createCmssyRobots(CONFIG, {
      baseUrl: "https://example.com/",
      disallow: ["/admin/"],
    })();
    expect(result.sitemap).toBe("https://example.com/sitemap.xml");
    expect(result.rules).toMatchObject({ disallow: ["/admin/"] });
  });
});

describe("createCmssySitemap", () => {
  it("maps published pages to localized entries with alternates", async () => {
    stubFetch({
      data: {
        publicPages: [
          { slug: "/", updatedAt: "2026-01-01T00:00:00Z", publishedAt: null },
          {
            slug: "/about",
            updatedAt: null,
            publishedAt: "2026-02-02T00:00:00Z",
          },
        ],
      },
    });
    const result = await createCmssySitemap(CONFIG)();
    expect(result).toHaveLength(2);
    expect(result[0]?.url).toBe("https://cmssy.com/");
    expect(result[0]?.alternates?.languages).toEqual({
      en: "https://cmssy.com/",
      pl: "https://cmssy.com/pl",
    });
    expect(result[1]?.url).toBe("https://cmssy.com/about");
    expect(result[1]?.alternates?.languages).toEqual({
      en: "https://cmssy.com/about",
      pl: "https://cmssy.com/pl/about",
    });
    expect(result[1]?.lastModified).toEqual(new Date("2026-02-02T00:00:00Z"));
  });

  it("degrades to [] when the page fetch fails", async () => {
    stubFetch({}, false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await createCmssySitemap(CONFIG)()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("omits alternates for a single-locale site", async () => {
    stubFetch({
      data: {
        publicPages: [{ slug: "/", updatedAt: null, publishedAt: null }],
      },
    });
    const result = await createCmssySitemap({
      ...CONFIG,
      enabledLocales: ["en"],
    })();
    expect(result[0]?.alternates).toBeUndefined();
  });

  it("excludes reserved 404 slugs by default", async () => {
    stubFetch({
      data: {
        publicPages: [
          { slug: "/", updatedAt: null, publishedAt: null },
          { slug: "/not-found", updatedAt: null, publishedAt: null },
          { slug: "/404", updatedAt: null, publishedAt: null },
        ],
      },
    });
    const result = await createCmssySitemap(CONFIG)();
    expect(result.map((e) => e.url)).toEqual(["https://cmssy.com/"]);
  });

  it("honours a custom excludeSlugs list", async () => {
    stubFetch({
      data: {
        publicPages: [
          { slug: "/", updatedAt: null, publishedAt: null },
          { slug: "/draft", updatedAt: null, publishedAt: null },
        ],
      },
    });
    const result = await createCmssySitemap(CONFIG, {
      excludeSlugs: ["/draft"],
    })();
    expect(result.map((e) => e.url)).toEqual(["https://cmssy.com/"]);
  });

  it("normalizes slugs without a leading slash", async () => {
    stubFetch({
      data: {
        publicPages: [{ slug: "about", updatedAt: null, publishedAt: null }],
      },
    });
    const result = await createCmssySitemap(CONFIG)();
    expect(result[0]?.url).toBe("https://cmssy.com/about");
    expect(result[0]?.alternates?.languages?.pl).toBe(
      "https://cmssy.com/pl/about",
    );
  });
});
