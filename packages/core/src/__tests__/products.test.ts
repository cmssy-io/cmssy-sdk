import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchProducts, PRODUCTS_QUERY } from "../commerce/product-client";

const config = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
} as never;

const records = { items: [], total: 0, hasMore: false };

/** fetchProducts resolves the workspace id first, so both calls are answered. */
function mockFetch() {
  const productVariables: Array<Record<string, unknown>> = [];
  const fetch = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as {
      query: string;
      variables: Record<string, unknown>;
    };
    if (
      body.query.includes("PublicSiteConfig") ||
      body.query.includes("siteConfig")
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            public: {
              siteConfig: {
                workspaceId: "6a4366000000000000000000",
                defaultLanguage: "en",
                enabledLanguages: ["en", "pl"],
              },
            },
          },
        }),
      };
    }
    productVariables.push(body.variables);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { public: { model: { records } } } }),
    };
  });
  vi.stubGlobal("fetch", fetch);
  return productVariables;
}

describe("fetchProducts locale", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the query with the locale argument", () => {
    expect(PRODUCTS_QUERY).toContain("$locale: String");
    expect(PRODUCTS_QUERY).toContain("locale: $locale");
  });

  it("asks the API for the caller's language", async () => {
    const calls = mockFetch();
    await fetchProducts(config, { modelSlug: "product", locale: "pl" });
    expect(calls[0]?.locale).toBe("pl");
  });

  it("outside a request, asks for no language rather than throwing", async () => {
    // fetchProducts also runs at build time, where next/headers throws. Null
    // means "the workspace's default language" - what a catalog read did before
    // locales existed.
    const calls = mockFetch();
    await fetchProducts(config, { modelSlug: "product" });
    expect(calls[0]?.locale).toBeNull();
  });
});
