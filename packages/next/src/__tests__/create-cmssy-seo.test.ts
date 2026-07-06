import { afterEach, describe, expect, it, vi } from "vitest";
import { createCmssyRobots } from "../create-cmssy-robots";
import { createCmssySitemap } from "../create-cmssy-sitemap";
import { buildCmssyMetadata } from "../build-cmssy-metadata";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: "cmssy",
  draftSecret: "draft-secret-1234",
  editorOrigin: "https://app.cmssy.io",
  siteUrl: "https://cmssy.com",
  defaultLocale: "en",
  enabledLocales: ["en", "pl"],
};

interface StubPage {
  id: string;
  slug: string;
  updatedAt: string | null;
  publishedAt: string | null;
}

/**
 * Routes the two GraphQL calls createCmssySitemap makes: publicPages and
 * public.siteConfig (for notFoundPageId).
 */
function stubGraphql(opts: {
  pages?: StubPage[];
  notFoundPageId?: string | null;
  pagesOk?: boolean;
}) {
  const { pages = [], notFoundPageId = null, pagesOk = true } = opts;
  const fetchStub = vi.fn(async (_url: string, init: { body: string }) => {
    const query = JSON.parse(init.body).query as string;
    if (query.includes("PublicSiteConfig")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { public: { siteConfig: { notFoundPageId } } } }),
      };
    }
    return {
      ok: pagesOk,
      status: pagesOk ? 200 : 500,
      json: async () => ({ data: { public: { page: { list: pages } } } }),
    };
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

afterEach(() => vi.unstubAllGlobals());

describe("createCmssyRobots", () => {
  it("allows crawling, disallows /api/, references the sitemap, no Host", async () => {
    const result = await createCmssyRobots(CONFIG)();
    expect(result.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    });
    expect(result.sitemap).toBe("https://cmssy.com/sitemap.xml");
    // Host is a Yandex-only directive Google warns on; off by default.
    expect(result.host).toBeUndefined();
  });

  it("emits the Host directive only when opted in", async () => {
    const result = await createCmssyRobots(CONFIG, { host: true })();
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
    stubGraphql({
      pages: [
        {
          id: "1",
          slug: "/",
          updatedAt: "2026-01-01T00:00:00Z",
          publishedAt: null,
        },
        {
          id: "2",
          slug: "/about",
          updatedAt: null,
          publishedAt: "2026-02-02T00:00:00Z",
        },
      ],
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
    stubGraphql({ pagesOk: false });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await createCmssySitemap(CONFIG)()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("omits alternates for a single-locale site", async () => {
    stubGraphql({
      pages: [{ id: "1", slug: "/", updatedAt: null, publishedAt: null }],
    });
    const result = await createCmssySitemap({
      ...CONFIG,
      enabledLocales: ["en"],
    })();
    expect(result[0]?.alternates).toBeUndefined();
  });

  it("excludes the workspace's configured 404 page by id", async () => {
    stubGraphql({
      pages: [
        { id: "home", slug: "/", updatedAt: null, publishedAt: null },
        { id: "nf", slug: "/not-found", updatedAt: null, publishedAt: null },
      ],
      notFoundPageId: "nf",
    });
    const result = await createCmssySitemap(CONFIG)();
    expect(result.map((e) => e.url)).toEqual(["https://cmssy.com/"]);
  });

  it("keeps a /not-found page that is NOT the configured 404 page", async () => {
    stubGraphql({
      pages: [
        { id: "real", slug: "/not-found", updatedAt: null, publishedAt: null },
      ],
      notFoundPageId: "some-other-id",
    });
    const result = await createCmssySitemap(CONFIG)();
    expect(result.map((e) => e.url)).toEqual(["https://cmssy.com/not-found"]);
  });

  it("honours a custom excludeSlugs list (normalized)", async () => {
    stubGraphql({
      pages: [
        { id: "1", slug: "/", updatedAt: null, publishedAt: null },
        { id: "2", slug: "draft", updatedAt: null, publishedAt: null },
      ],
    });
    const result = await createCmssySitemap(CONFIG, {
      excludeSlugs: ["/draft"],
    })();
    expect(result.map((e) => e.url)).toEqual(["https://cmssy.com/"]);
  });

  it("normalizes slugs without a leading slash", async () => {
    stubGraphql({
      pages: [{ id: "1", slug: "about", updatedAt: null, publishedAt: null }],
    });
    const result = await createCmssySitemap(CONFIG)();
    expect(result[0]?.url).toBe("https://cmssy.com/about");
    expect(result[0]?.alternates?.languages?.pl).toBe(
      "https://cmssy.com/pl/about",
    );
  });
});

describe("buildCmssyMetadata", () => {
  /** Routes publicPage (meta) and public.siteConfig. */
  function stubMeta(opts: {
    page?: Record<string, unknown> | null;
    siteConfig?: Record<string, unknown> | null;
  }) {
    const { page = null, siteConfig = null } = opts;
    const fetchStub = vi.fn(async (_url: string, init: { body: string }) => {
      const query = JSON.parse(init.body).query as string;
      if (query.includes("PublicSiteConfig")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { public: { siteConfig: siteConfig } } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { public: { page: { get: page } } } }),
      };
    });
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
  }

  const SITE_CONFIG = {
    siteName: { en: "Cmssy", pl: "Cmssy" },
    enabledLanguages: ["en", "pl"],
    branding: { brandName: "cmssy", ogImageUrl: "https://assets/og.png" },
  };

  const localeConfig = {
    ...CONFIG,
    resolveLocale: () => "en",
  };

  it("builds full metadata: title, description, canonical, hreflang, OG, twitter", async () => {
    stubMeta({
      page: {
        id: "1",
        seoTitle: { en: "About Cmssy", pl: "O Cmssy" },
        seoDescription: { en: "Learn about us", pl: "O nas" },
        seoKeywords: ["cms", "headless"],
        displayName: { en: "About", pl: "O nas" },
      },
      siteConfig: SITE_CONFIG,
    });
    const md = await buildCmssyMetadata(localeConfig, ["about"]);
    expect(md.title).toBe("About Cmssy");
    expect(md.description).toBe("Learn about us");
    expect(md.keywords).toEqual(["cms", "headless"]);
    expect(md.metadataBase?.toString()).toBe("https://cmssy.com/");
    expect(md.alternates?.canonical).toBe("https://cmssy.com/about");
    expect(md.alternates?.languages).toEqual({
      en: "https://cmssy.com/about",
      pl: "https://cmssy.com/pl/about",
    });
    expect(md.openGraph?.url).toBe("https://cmssy.com/about");
    expect((md.openGraph as { type?: string })?.type).toBe("website");
    expect(md.openGraph?.images).toEqual([{ url: "https://assets/og.png" }]);
    expect((md.openGraph as { siteName?: string })?.siteName).toBe("Cmssy");
    expect((md.twitter as { card?: string })?.card).toBe("summary_large_image");
    expect(md.twitter?.images).toEqual(["https://assets/og.png"]);
  });

  it("falls back to displayName then siteName for the title", async () => {
    stubMeta({
      page: {
        id: "1",
        seoTitle: null,
        seoDescription: null,
        seoKeywords: null,
        displayName: { en: "Home" },
      },
      siteConfig: SITE_CONFIG,
    });
    const md = await buildCmssyMetadata(localeConfig, undefined);
    expect(md.title).toBe("Home");
    expect(md.alternates?.canonical).toBe("https://cmssy.com/");
  });

  it("uses summary card when there is no image", async () => {
    stubMeta({
      page: {
        id: "1",
        seoTitle: { en: "T" },
        seoDescription: { en: "D" },
        seoKeywords: null,
        displayName: {},
      },
      siteConfig: { ...SITE_CONFIG, branding: { ogImageUrl: null } },
    });
    const md = await buildCmssyMetadata(localeConfig, ["x"]);
    expect((md.twitter as { card?: string })?.card).toBe("summary");
    expect(md.openGraph?.images).toBeUndefined();
  });

  it("uses siteConfig.defaultLanguage when config has no defaultLocale", async () => {
    stubMeta({
      page: {
        id: "1",
        seoTitle: { pl: "Strona", en: "Page" },
        seoDescription: null,
        seoKeywords: null,
        displayName: {},
      },
      siteConfig: { ...SITE_CONFIG, defaultLanguage: "pl" },
    });
    // No defaultLocale on config; resolveLocale returns the default (pl).
    const md = await buildCmssyMetadata(
      {
        apiUrl: CONFIG.apiUrl,
        org: CONFIG.org,
        workspaceSlug: CONFIG.workspaceSlug,
        draftSecret: CONFIG.draftSecret,
        editorOrigin: CONFIG.editorOrigin,
        siteUrl: CONFIG.siteUrl,
        resolveLocale: () => "pl",
      },
      ["o-nas"],
    );
    // pl is the default -> no prefix; en gets the /en prefix.
    expect(md.alternates?.canonical).toBe("https://cmssy.com/o-nas");
    expect(md.alternates?.languages).toEqual({
      pl: "https://cmssy.com/o-nas",
      en: "https://cmssy.com/en/o-nas",
    });
    expect(md.title).toBe("Strona");
  });

  it("degrades gracefully when the page meta fetch fails", async () => {
    const fetchStub = vi.fn(async (_url: string, init: { body: string }) => {
      const query = JSON.parse(init.body).query as string;
      if (query.includes("PublicSiteConfig")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { public: { siteConfig: SITE_CONFIG } } }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchStub);
    const md = await buildCmssyMetadata(localeConfig, ["about"]);
    // No page meta, but siteName still drives the title and canonical resolves.
    expect(md.title).toBe("Cmssy");
    expect(md.alternates?.canonical).toBe("https://cmssy.com/about");
  });
});
