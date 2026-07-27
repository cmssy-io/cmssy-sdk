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
    // A published render with the draft secret would serve draft chrome to
    // everyone - the failure that is invisible from the outside.
    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: undefined,
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
    });
    // Both halves: the canvas renders stored content, where a relation is ids.
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
    // Returned so callers stop re-deriving it - which is how the adapters drifted.
    expect(result.path).toEqual(["about"]);
    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/about", {
      previewSecret: undefined,
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
    });
  });

  it("returns every configured editor origin, not the first", async () => {
    setup();

    const result = await resolveCmssyLayoutSlot(CONFIG, {
      position: "header",
      blocks: [],
      editMode: true,
      path: [],
    });

    // Collapsing this to origin[0] drops www.cmssy.io, and the editor served
    // from it gets its messages posted to the wrong origin.
    expect(result.editorOrigin).toEqual(CONFIG.editorOrigin);
  });
});
