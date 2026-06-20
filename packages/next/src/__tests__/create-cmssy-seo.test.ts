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

interface StubPage {
  id: string;
  slug: string;
  updatedAt: string | null;
  publishedAt: string | null;
}

/**
 * Routes the two GraphQL calls createCmssySitemap makes: publicPages and
 * publicSiteConfig (for notFoundPageId).
 */
function stubGraphql(opts: {
  pages?: StubPage[];
  notFoundPageId?: string | null;
  pagesOk?: boolean;
}) {
  const { pages = [], notFoundPageId = null, pagesOk = true } = opts;
  const fetchStub = vi.fn(async (_url: string, init: { body: string }) => {
    const query = JSON.parse(init.body).query as string;
    if (query.includes("publicSiteConfig")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { publicSiteConfig: { notFoundPageId } } }),
      };
    }
    return {
      ok: pagesOk,
      status: pagesOk ? 200 : 500,
      json: async () => ({ data: { publicPages: pages } }),
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
