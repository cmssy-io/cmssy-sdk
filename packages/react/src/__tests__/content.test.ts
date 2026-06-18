import { describe, it, expect, vi } from "vitest";
import { getBlockContentForLanguage } from "../content/get-block-content";
import {
  normalizeSlug,
  fetchPage,
  fetchPageById,
  fetchLayouts,
  type FetchLike,
} from "../content/content-client";

describe("getBlockContentForLanguage", () => {
  it("returns flat legacy content unchanged", () => {
    expect(getBlockContentForLanguage({ title: "Hi" }, "en")).toEqual({
      title: "Hi",
    });
  });

  it("selects the requested locale", () => {
    expect(
      getBlockContentForLanguage(
        { en: { title: "Hi" }, pl: { title: "Cześć" } },
        "pl",
      ),
    ).toEqual({ title: "Cześć" });
  });

  it("falls back to default then first available", () => {
    expect(
      getBlockContentForLanguage({ en: { title: "Hi" } }, "de", "en"),
    ).toEqual({ title: "Hi" });
    expect(
      getBlockContentForLanguage({ fr: { title: "Bonjour" } }, "de", "en"),
    ).toEqual({ title: "Bonjour" });
  });

  it("merges non-translatable top-level fields (mixed)", () => {
    expect(
      getBlockContentForLanguage(
        { en: { title: "Hi" }, showSwitcher: true },
        "en",
      ),
    ).toEqual({ showSwitcher: true, title: "Hi" });
  });

  it("preserves non-translatable object fields (detects locale by key)", () => {
    expect(
      getBlockContentForLanguage(
        { en: { title: "Hi" }, seo: { description: "d" } },
        "en",
      ),
    ).toEqual({ seo: { description: "d" }, title: "Hi" });
  });

  it("preserves a 2-letter-named object field when availableLocales is given", () => {
    expect(
      getBlockContentForLanguage(
        { id: { x: 1 }, en: { title: "Hi" } },
        "en",
        "en",
        ["en", "pl"],
      ),
    ).toEqual({ id: { x: 1 }, title: "Hi" });
  });

  it("returns {} for a non-object value", () => {
    expect(getBlockContentForLanguage(null, "en")).toEqual({});
    expect(getBlockContentForLanguage("x", "en")).toEqual({});
  });
});

describe("normalizeSlug", () => {
  it("handles catch-all arrays and strings", () => {
    expect(normalizeSlug(["uslugi", "restrukturyzacja"])).toBe(
      "/uslugi/restrukturyzacja",
    );
    expect(normalizeSlug([])).toBe("/");
    expect(normalizeSlug(undefined)).toBe("/");
    expect(normalizeSlug("about")).toBe("/about");
    expect(normalizeSlug("/about")).toBe("/about");
  });
});

describe("fetchPage", () => {
  const config = { apiUrl: "https://api.test/graphql", workspaceSlug: "ws" };

  function mockFetch(payload: unknown, ok = true): FetchLike {
    return async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => payload,
    });
  }

  it("returns publishedBlocks on an open read", async () => {
    const fetch = mockFetch({
      data: {
        publicPage: {
          id: "p1",
          blocks: [],
          publishedBlocks: [{ id: "b1", type: "hero", content: {} }],
        },
      },
    });
    const page = await fetchPage(config, ["home"], { fetch });
    expect(page?.blocks).toHaveLength(1);
    expect(page?.blocks[0]?.type).toBe("hero");
  });

  it("returns draft blocks when previewSecret is set", async () => {
    const fetch = mockFetch({
      data: {
        publicPage: {
          id: "p1",
          blocks: [{ id: "d1", type: "hero", content: {} }],
          publishedBlocks: [],
        },
      },
    });
    const page = await fetchPage(config, "/", { fetch, previewSecret: "s" });
    expect(page?.blocks[0]?.id).toBe("d1");
  });

  it("treats an empty previewSecret as published (sends null, no draft)", async () => {
    let sentBody: { variables: { previewSecret: unknown } } | undefined;
    const fetchImpl: FetchLike = async (_url, init) => {
      sentBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            publicPage: {
              id: "p1",
              blocks: [{ id: "d1", type: "hero", content: {} }],
              publishedBlocks: [{ id: "b1", type: "hero", content: {} }],
            },
          },
        }),
      };
    };
    const page = await fetchPage(config, "/", {
      fetch: fetchImpl,
      previewSecret: "",
    });
    expect(sentBody?.variables.previewSecret).toBeNull();
    expect(page?.blocks[0]?.id).toBe("b1");
  });

  it("returns null for a genuinely missing page", async () => {
    const fetch = mockFetch({ data: { publicPage: null } });
    expect(await fetchPage(config, "/missing", { fetch })).toBeNull();
  });

  it("throws on GraphQL errors (not a 404)", async () => {
    const fetch = mockFetch({
      data: null,
      errors: [{ message: "Workspace not found" }],
    });
    await expect(fetchPage(config, "/", { fetch })).rejects.toThrow(
      /Workspace not found/,
    );
  });

  it("throws a clear error on a non-JSON response", async () => {
    const fetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    await expect(fetchPage(config, "/", { fetch })).rejects.toThrow(
      /invalid JSON/,
    );
  });

  it("includes GraphQL error messages on a non-ok response", async () => {
    const fetch: FetchLike = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ errors: [{ message: "Bad query" }] }),
    });
    await expect(fetchPage(config, "/", { fetch })).rejects.toThrow(
      /Bad query/,
    );
  });

  it("treats a whitespace-only previewSecret as published", async () => {
    let sentBody: { variables: { previewSecret: unknown } } | undefined;
    const fetch: FetchLike = async (_url, init) => {
      sentBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            publicPage: {
              id: "p",
              blocks: [{ id: "d", type: "h", content: {} }],
              publishedBlocks: [{ id: "b", type: "h", content: {} }],
            },
          },
        }),
      };
    };
    const result = await fetchPage(config, "/", {
      fetch,
      previewSecret: "   ",
    });
    expect(sentBody?.variables.previewSecret).toBeNull();
    expect(result?.blocks[0]?.id).toBe("b");
  });

  it("throws on a non-ok response", async () => {
    const fetch = mockFetch({}, false);
    await expect(fetchPage(config, "/", { fetch })).rejects.toThrow(
      /page fetch failed/,
    );
  });
});

describe("fetchPageById", () => {
  const config = { apiUrl: "https://api.test/graphql", workspaceSlug: "ws" };

  function mockFetch(payload: unknown, ok = true): FetchLike {
    return async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => payload,
    });
  }

  it("returns publishedBlocks for the requested page id", async () => {
    const fetch = mockFetch({
      data: {
        publicPageById: {
          id: "nf1",
          publishedBlocks: [{ id: "b1", type: "hero", content: {} }],
        },
      },
    });
    const page = await fetchPageById(config, "nf1", { fetch });
    expect(page?.id).toBe("nf1");
    expect(page?.blocks).toHaveLength(1);
    expect(page?.blocks[0]?.type).toBe("hero");
  });

  it("sends workspaceSlug + pageId in the query variables", async () => {
    let sent: { variables: Record<string, unknown> } | undefined;
    const fetch: FetchLike = async (_url, init) => {
      sent = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { publicPageById: null } }),
      };
    };
    await fetchPageById(config, "nf1", { fetch });
    expect(sent?.variables.workspaceSlug).toBe("ws");
    expect(sent?.variables.pageId).toBe("nf1");
  });

  it("returns null when the page is missing or unpublished", async () => {
    const fetch = mockFetch({ data: { publicPageById: null } });
    expect(await fetchPageById(config, "missing", { fetch })).toBeNull();
  });

  it("defaults blocks to [] when publishedBlocks is null", async () => {
    const fetch = mockFetch({
      data: { publicPageById: { id: "nf1", publishedBlocks: null } },
    });
    const page = await fetchPageById(config, "nf1", { fetch });
    expect(page?.blocks).toEqual([]);
  });

  it("throws on GraphQL errors", async () => {
    const fetch = mockFetch({
      data: null,
      errors: [{ message: "boom" }],
    });
    await expect(fetchPageById(config, "nf1", { fetch })).rejects.toThrow(
      /boom/,
    );
  });

  it("throws on a non-ok response", async () => {
    const fetch = mockFetch({}, false);
    await expect(fetchPageById(config, "nf1", { fetch })).rejects.toThrow(
      /page-by-id fetch failed/,
    );
  });
});

describe("fetchLayouts", () => {
  const config = { apiUrl: "https://api.test/graphql", workspaceSlug: "ws" };

  function mockFetch(payload: unknown, ok = true): FetchLike {
    return async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => payload,
    });
  }

  it("returns the resolved layout groups", async () => {
    const fetch = mockFetch({
      data: {
        publicPageLayouts: [
          {
            position: "header",
            blocks: [
              {
                id: "h1",
                type: "header",
                content: {},
                order: 0,
                isActive: true,
              },
            ],
          },
          { position: "footer", blocks: [] },
        ],
      },
    });
    const groups = await fetchLayouts(config, "/", { fetch });
    expect(groups).toHaveLength(2);
    expect(groups[0]?.position).toBe("header");
    expect(groups[0]?.blocks[0]?.id).toBe("h1");
  });

  it("sends pageSlug + null previewSecret on an open read", async () => {
    let sent: { variables: Record<string, unknown> } | undefined;
    const fetch: FetchLike = async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ data: {} }) };
    };
    await fetchLayouts(config, ["about"], { fetch });
    expect(sent?.variables.pageSlug).toBe("/about");
    expect(sent?.variables.previewSecret).toBeNull();
  });

  it("forwards previewSecret for a draft read", async () => {
    let sent: { variables: Record<string, unknown> } | undefined;
    const fetch: FetchLike = async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ data: {} }) };
    };
    await fetchLayouts(config, "/", { fetch, previewSecret: "secret" });
    expect(sent?.variables.previewSecret).toBe("secret");
  });

  it("returns [] when the query yields nothing", async () => {
    const fetch = mockFetch({ data: { publicPageLayouts: null } });
    expect(await fetchLayouts(config, "/", { fetch })).toEqual([]);
  });
});
