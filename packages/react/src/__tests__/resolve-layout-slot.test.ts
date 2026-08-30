import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCmssyLayoutSlot } from "../components/resolve-layout-slot";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: "shop",
  draftSecret: "draft-secret-1234",
  editorOrigin: ["https://cmssy.io", "https://www.cmssy.io"],
};

const GROUPS = [
  { position: "header", blocks: [{ id: "b1", type: "site-header" }] },
  {
    position: "sidebar_left",
    blocks: [],
    settings: { width: 18, sticky: true },
  },
];

const fetchLayouts = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/core/internal", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, fetchLayouts };
});

const resolveSiteLocales = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/core/internal/locale", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, resolveSiteLocales };
});

const resolveEditorLayoutBlockData = vi.hoisted(() => vi.fn());
vi.mock("../components/resolve-block-data", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, resolveEditorLayoutBlockData };
});

function setup() {
  fetchLayouts.mockResolvedValue(GROUPS);
  resolveSiteLocales.mockResolvedValue({
    defaultLocale: "en",
    locales: ["en", "no"],
  });
  resolveEditorLayoutBlockData.mockResolvedValue({
    data: { b1: { categories: [] } },
    content: { b1: { heading: "Shop" } },
  });
}

afterEach(() => vi.clearAllMocks());

describe("resolveCmssyLayoutSlot", () => {
  it("fetches without the preview secret for a visitor", async () => {
    setup();

    const result = await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: false,
      path: [],
    });

    expect(result.groups).toBe(GROUPS);
    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: undefined,
      retry: "build",
    });
    expect(result.data).toBeUndefined();
  });

  it("fetches the draft, and both editor halves, in edit mode", async () => {
    setup();

    const result = await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: true,
      path: [],
    });

    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: CONFIG.draftSecret,
      retry: "build",
    });
    expect(result.data).toEqual({ b1: { categories: [] } });
    expect(result.resolvedContent).toEqual({ b1: { heading: "Shop" } });
  });

  it("takes the language from the routed path and returns the slug", async () => {
    setup();

    const result = await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: false,
      path: ["no", "about"],
    });

    expect(result.locale).toBe("no");
    expect(result.path).toEqual(["about"]);
    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/about", {
      previewSecret: undefined,
      retry: "build",
    });
  });

  it("takes an explicit locale where there are no segments to read", async () => {
    setup();

    const result = await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: false,
      locale: "no",
    });

    expect(result.locale).toBe("no");
  });

  it("lets an explicit page override the routed one", async () => {
    setup();

    await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: false,
      path: ["no", "about"],
      page: "/",
    });

    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: undefined,
      retry: "build",
    });
  });

  it("hands the editor resolution the routed page - slug and path, no id (CMS-1708)", async () => {
    setup();

    const result = await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: true,
      path: ["no", "docs", "blocks"],
    });

    const page = { slug: "/docs/blocks", path: ["docs", "blocks"] };
    expect(result.page).toStrictEqual(page);
    expect(resolveEditorLayoutBlockData).toHaveBeenCalledWith(
      expect.objectContaining({ page }),
    );
  });

  it("describes the explicit page, not the routed one, when both are given", async () => {
    setup();

    const result = await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: false,
      path: ["about"],
      page: "/pricing/teams",
    });

    expect(result.page).toStrictEqual({
      slug: "/pricing/teams",
      path: ["pricing", "teams"],
    });
    expect(result.path).toEqual(["about"]);
  });

  it("returns the region's settings, and null for a region without any", async () => {
    setup();

    const sidebar = await resolveCmssyLayoutSlot(CONFIG, {
      position: "sidebar_left",
      blocks: [],
      editMode: false,
      path: [],
    });
    expect(sidebar.settings).toStrictEqual({ width: 18, sticky: true });

    const header = await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: false,
      path: [],
    });
    expect(header.settings).toBeNull();

    const missing = await resolveCmssyLayoutSlot(CONFIG, {
      position: "footer",
      blocks: [],
      editMode: false,
      path: [],
    });
    expect(missing.settings).toBeNull();
  });

  it("returns every configured editor origin, not the first", async () => {
    setup();

    const result = await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: true,
      path: [],
    });

    expect(result.editorOrigin).toEqual(CONFIG.editorOrigin);
  });
});

describe("resolveCmssyLayoutSlot retry policy (CMS-1460)", () => {
  it("uses the build mode for both delivery calls by default", async () => {
    setup();

    await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: false,
      path: [],
    });

    expect(resolveSiteLocales).toHaveBeenCalledWith(CONFIG, { retry: "build" });
    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: undefined,
      retry: "build",
    });
  });

  it("forwards an explicit policy to both delivery calls", async () => {
    setup();

    await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: false,
      path: [],
      retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
    });

    expect(resolveSiteLocales).toHaveBeenCalledWith(CONFIG, {
      retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
    });
    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: undefined,
      retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
    });
  });

  it("turns retry off for both delivery calls when the caller passes false", async () => {
    setup();

    await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: false,
      path: [],
      retry: false,
    });

    expect(resolveSiteLocales).toHaveBeenCalledWith(CONFIG, { retry: false });
    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: undefined,
      retry: false,
    });
  });
});
