import { describe, it, expect, vi } from "vitest";
import { getBlockContentForLanguage } from "../content/get-block-content";
import { normalizeSlug, fetchPage } from "../content/content-client";

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

  function mockFetch(payload: unknown, ok = true): typeof fetch {
    return vi.fn(async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => payload,
    })) as unknown as typeof fetch;
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

  it("returns null for a missing page", async () => {
    const fetch = mockFetch({ data: { publicPage: null } });
    expect(await fetchPage(config, "/missing", { fetch })).toBeNull();
  });

  it("throws on a non-ok response", async () => {
    const fetch = mockFetch({}, false);
    await expect(fetchPage(config, "/", { fetch })).rejects.toThrow(
      /page fetch failed/,
    );
  });
});
