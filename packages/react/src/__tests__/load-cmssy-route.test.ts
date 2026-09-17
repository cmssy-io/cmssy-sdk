import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCmssyRoute } from "../components/load-cmssy-route";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: "shop",
  draftSecret: "draft-secret-1234",
  layout: {
    regions: [{ id: "header" }, { id: "footer" }],
  },
} as Parameters<typeof loadCmssyRoute>[0];

const GROUPS = [
  {
    region: "header",
    blocks: [{ id: "h1", type: "nav", order: 0, isActive: true, content: {} }],
  },
  {
    region: "footer",
    blocks: [{ id: "f1", type: "nav", order: 0, isActive: true, content: {} }],
  },
];

const PAGE = {
  id: "p1",
  slug: "/pricing",
  blocks: [{ id: "b1", type: "hero", content: {} }],
};

const fetchLayouts = vi.hoisted(() => vi.fn());
const fetchPage = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/core/internal", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, fetchLayouts, fetchPage };
});

const resolveSiteLocales = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/core/internal/locale", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, resolveSiteLocales };
});

const resolveEditorBlockData = vi.hoisted(() => vi.fn());
const resolveEditorLayoutBlockData = vi.hoisted(() => vi.fn());
vi.mock("../components/resolve-block-data", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, resolveEditorBlockData, resolveEditorLayoutBlockData };
});

function setup() {
  fetchLayouts.mockResolvedValue(GROUPS);
  fetchPage.mockResolvedValue(PAGE);
  resolveSiteLocales.mockResolvedValue({
    defaultLocale: "en",
    locales: ["en", "no"],
  });
  resolveEditorBlockData.mockResolvedValue({
    data: { b1: { deals: [] } },
    content: { b1: { heading: "Pricing" } },
  });
  resolveEditorLayoutBlockData.mockImplementation(
    ({ region }: { region: string }) =>
      Promise.resolve({
        data: { [`${region}-block`]: region },
        content: { [`${region}-block`]: { label: region } },
      }),
  );
}

afterEach(() => vi.clearAllMocks());

describe("loadCmssyRoute (CMS-1874)", () => {
  it("returns everything a synchronous render needs, for every configured region", async () => {
    setup();

    const route = await loadCmssyRoute(CONFIG, {
      blocks: [],
      path: ["pricing"],
    });

    expect(route.page).toBe(PAGE);
    expect(route.layouts).toBe(GROUPS);
    expect(route.locale).toBe("en");
    expect(route.defaultLocale).toBe("en");
    expect(route.enabledLocales).toStrictEqual(["en", "no"]);
    expect(route.regions).toStrictEqual(["header", "footer"]);
    expect(route.blockContent).toStrictEqual({ b1: { heading: "Pricing" } });
    expect(route.blockData).toStrictEqual({ b1: { deals: [] } });
    expect(Object.keys(route.layoutData).sort()).toStrictEqual([
      "footer",
      "header",
    ]);
    expect(route.layoutData.footer?.content).toStrictEqual({
      "footer-block": { label: "footer" },
    });
  });

  it("fetches the page without a preview secret unless one is given", async () => {
    setup();

    await loadCmssyRoute(CONFIG, { blocks: [], path: ["pricing"] });
    expect(fetchPage.mock.calls[0]?.[2]).not.toHaveProperty("previewSecret");

    await loadCmssyRoute(CONFIG, {
      blocks: [],
      path: ["pricing"],
      previewSecret: "draft-secret-1234",
    });
    expect(fetchPage.mock.calls[1]?.[2]).toMatchObject({
      previewSecret: "draft-secret-1234",
    });
  });

  it("asks only for the regions the caller named", async () => {
    setup();

    const route = await loadCmssyRoute(CONFIG, {
      blocks: [],
      path: [],
      regions: ["footer"],
    });

    expect(route.regions).toStrictEqual(["footer"]);
    expect(
      resolveEditorLayoutBlockData.mock.calls.map(([args]) => args.region),
    ).toStrictEqual(["footer"]);
  });

  it("keeps a missing page from failing the route", async () => {
    setup();
    fetchPage.mockResolvedValue(null);
    resolveEditorBlockData.mockResolvedValue({ data: {}, content: {} });

    const route = await loadCmssyRoute(CONFIG, { blocks: [], path: ["gone"] });

    expect(route.page).toBeNull();
    expect(route.layoutData.header?.data).toStrictEqual({
      "header-block": "header",
    });
  });
});
