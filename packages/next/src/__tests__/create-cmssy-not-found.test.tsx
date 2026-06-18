import { beforeEach, describe, expect, it, vi } from "vitest";
import { CmssyServerPage, defineBlock, type CmssyPageData } from "@cmssy/react";
import { CmssyLocaleProvider } from "@cmssy/react/client";

type RenderedEl = { type: unknown; props: Record<string, unknown> };

/** createCmssyNotFound wraps its output in CmssyLocaleProvider; assert on the child. */
function unwrap(node: unknown): RenderedEl {
  const element = node as { type: unknown; props: { children: unknown } };
  expect(element.type).toBe(CmssyLocaleProvider);
  return element.props.children as RenderedEl;
}

const fetchSiteConfig = vi.hoisted(() => vi.fn());
const fetchPageById = vi.hoisted(() => vi.fn());
const resolveSiteLocales = vi.hoisted(() => vi.fn());
const resolveForms = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/react", async (importActual) => {
  const actual = await importActual<typeof import("@cmssy/react")>();
  return {
    ...actual,
    fetchSiteConfig,
    fetchPageById,
    resolveSiteLocales,
    resolveForms,
  };
});

import { createCmssyNotFound } from "../create-cmssy-not-found";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  workspaceSlug: "pilot",
  draftSecret: "draft-secret-1234",
  editorOrigin: "https://app.cmssy.io",
};

const NOT_FOUND_PAGE: CmssyPageData = {
  id: "nf-1",
  blocks: [{ id: "b1", type: "editorial-intro", content: {} }],
};

const BLOCKS = [
  defineBlock({
    type: "editorial-intro",
    label: "Editorial",
    component: () => null,
    props: {},
  }),
];

describe("createCmssyNotFound", () => {
  beforeEach(() => {
    fetchSiteConfig.mockReset();
    fetchPageById.mockReset();
    resolveForms.mockReset();
    resolveForms.mockResolvedValue({});
    resolveSiteLocales.mockReset();
    resolveSiteLocales.mockResolvedValue({
      defaultLocale: "en",
      locales: ["en"],
    });
  });

  it("renders the configured 404 page via CmssyServerPage", async () => {
    fetchSiteConfig.mockResolvedValue({ notFoundPageId: "nf-1" });
    fetchPageById.mockResolvedValue(NOT_FOUND_PAGE);
    const NotFound = createCmssyNotFound(CONFIG, BLOCKS);
    const element = unwrap(await NotFound());
    expect(element.type).toBe(CmssyServerPage);
    expect(element.props.page).toBe(NOT_FOUND_PAGE);
    expect(element.props.blocks).toBe(BLOCKS);
    expect(fetchPageById).toHaveBeenCalledWith(
      { apiUrl: CONFIG.apiUrl, workspaceSlug: CONFIG.workspaceSlug },
      "nf-1",
    );
  });

  it("renders the default fallback when no 404 page is configured", async () => {
    fetchSiteConfig.mockResolvedValue({ notFoundPageId: null });
    const NotFound = createCmssyNotFound(CONFIG, BLOCKS);
    const element = (await NotFound()) as RenderedEl;
    expect((element.type as { name?: string }).name).toBe("DefaultNotFound");
    expect(fetchPageById).not.toHaveBeenCalled();
  });

  it("renders the fallback when site config is unavailable", async () => {
    fetchSiteConfig.mockResolvedValue(null);
    const NotFound = createCmssyNotFound(CONFIG, BLOCKS);
    const element = (await NotFound()) as RenderedEl;
    expect((element.type as { name?: string }).name).toBe("DefaultNotFound");
  });

  it("renders the fallback when the configured page is missing", async () => {
    fetchSiteConfig.mockResolvedValue({ notFoundPageId: "nf-1" });
    fetchPageById.mockResolvedValue(null);
    const NotFound = createCmssyNotFound(CONFIG, BLOCKS);
    const element = (await NotFound()) as RenderedEl;
    expect((element.type as { name?: string }).name).toBe("DefaultNotFound");
  });

  it("renders the fallback when the configured page has no blocks", async () => {
    fetchSiteConfig.mockResolvedValue({ notFoundPageId: "nf-1" });
    fetchPageById.mockResolvedValue({ id: "nf-1", blocks: [] });
    const NotFound = createCmssyNotFound(CONFIG, BLOCKS);
    const element = (await NotFound()) as RenderedEl;
    expect((element.type as { name?: string }).name).toBe("DefaultNotFound");
  });

  it("uses a custom fallback when provided", async () => {
    fetchSiteConfig.mockResolvedValue({ notFoundPageId: null });
    const fallback = "CUSTOM_FALLBACK";
    const NotFound = createCmssyNotFound(CONFIG, BLOCKS, { fallback });
    const element = await NotFound();
    expect(element).toBe(fallback);
  });

  it("degrades to the fallback when a fetch throws (no 500)", async () => {
    fetchSiteConfig.mockRejectedValue(new Error("network down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const NotFound = createCmssyNotFound(CONFIG, BLOCKS);
    const element = (await NotFound()) as RenderedEl;
    expect((element.type as { name?: string }).name).toBe("DefaultNotFound");
    warn.mockRestore();
  });

  it("degrades to the fallback when the page fetch throws", async () => {
    fetchSiteConfig.mockResolvedValue({ notFoundPageId: "nf-1" });
    fetchPageById.mockRejectedValue(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const NotFound = createCmssyNotFound(CONFIG, BLOCKS);
    const element = (await NotFound()) as RenderedEl;
    expect((element.type as { name?: string }).name).toBe("DefaultNotFound");
    warn.mockRestore();
  });

  it("threads the resolved locale", async () => {
    fetchSiteConfig.mockResolvedValue({ notFoundPageId: "nf-1" });
    fetchPageById.mockResolvedValue(NOT_FOUND_PAGE);
    const NotFound = createCmssyNotFound(
      { ...CONFIG, resolveLocale: () => "pl" },
      BLOCKS,
    );
    const element = unwrap(await NotFound());
    expect(element.props.locale).toBe("pl");
    expect(element.props.defaultLocale).toBe("en");
  });

  it("throws when blocks is not an array", () => {
    expect(() =>
      createCmssyNotFound(CONFIG, undefined as unknown as typeof BLOCKS),
    ).toThrow(/requires a blocks array/);
  });
});
