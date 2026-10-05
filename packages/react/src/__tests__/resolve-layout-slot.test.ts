import type { CmssyLayoutGroup } from "@cmssy/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCmssyLayoutStore } from "@cmssy/core/internal";
import { resolveCmssyLayoutSlot } from "../components/resolve-layout-slot";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: "shop",
  draftSecret: "draft-secret-1234",
  editorOrigin: ["https://cmssy.io", "https://www.cmssy.io"],
};

const GROUPS = [
  {
    region: "header",
    blocks: [
      {
        id: "b1",
        type: "site-header",
        content: { logo: "/logo.svg" },
        style: { sticky: true },
        advanced: { anchor: "top" },
        order: 0,
        isActive: true,
      },
    ],
  },
  {
    region: "sidebar_left",
    blocks: [],
    settings: { width: 18, sticky: true },
  },
] satisfies CmssyLayoutGroup[];

const fetchLayouts = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/core/internal", async (importActual) => {
  const actual =
    await importActual<typeof import("@cmssy/core/internal")>();
  return { ...actual, fetchLayouts };
});

const resolveSiteLocales = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/core/internal/locale", async (importActual) => {
  const actual =
    await importActual<typeof import("@cmssy/core/internal/locale")>();
  return { ...actual, resolveSiteLocales };
});

const resolveEditorLayoutBlockData = vi.hoisted(() => vi.fn());
vi.mock("../components/resolve-block-data", async (importActual) => {
  const actual =
    await importActual<typeof import("../components/resolve-block-data")>();
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
      region: "header",
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
      region: "header",
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
      region: "header",
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
      region: "header",
      blocks: [],
      editMode: false,
      locale: "no",
    });

    expect(result.locale).toBe("no");
  });

  it("lets an explicit page override the routed one", async () => {
    setup();

    await resolveCmssyLayoutSlot(CONFIG, {
      region: "header",
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
      region: "header",
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
      region: "header",
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
      region: "sidebar_left",
      blocks: [],
      editMode: false,
      path: [],
    });
    expect(sidebar.settings).toStrictEqual({ width: 18, sticky: true });

    const header = await resolveCmssyLayoutSlot(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: [],
    });
    expect(header.settings).toBeNull();

    const missing = await resolveCmssyLayoutSlot(CONFIG, {
      region: "footer",
      blocks: [],
      editMode: false,
      path: [],
    });
    expect(missing.settings).toBeNull();
  });

  it("fetches the draft for a preview visitor without going through the editor half (CMS-1708)", async () => {
    setup();

    const result = await resolveCmssyLayoutSlot(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      preview: true,
      path: [],
    });

    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: CONFIG.draftSecret,
      retry: "build",
    });
    expect(resolveEditorLayoutBlockData).not.toHaveBeenCalled();
    expect(result.data).toBeUndefined();
    expect(result.editorOrigin).toBeUndefined();
  });

  it("returns every configured editor origin, not the first", async () => {
    setup();

    const result = await resolveCmssyLayoutSlot(CONFIG, {
      region: "header",
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
      region: "header",
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
      region: "header",
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
      region: "header",
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

describe("resolveCmssyLayoutSlot fetch passthrough (CMS-952)", () => {
  it("hands the caller's fetch to both reads, next to the retry policy", async () => {
    setup();
    const own = vi.fn();

    await resolveCmssyLayoutSlot(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: [],
      fetch: own,
    });

    expect(resolveSiteLocales).toHaveBeenCalledWith(CONFIG, {
      retry: "build",
      fetch: own,
    });
    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: undefined,
      retry: "build",
      fetch: own,
    });
  });

  it("adds no fetch key when the caller passes none", async () => {
    setup();

    await resolveCmssyLayoutSlot(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: [],
    });

    expect(resolveSiteLocales).toHaveBeenCalledWith(CONFIG, { retry: "build" });
  });

  it("fetches the layout once for a render that mounts three regions", async () => {
    setup();
    const layoutStore = createCmssyLayoutStore();

    const slots = await Promise.all(
      ["header", "sidebar_left", "footer"].map((region) =>
        resolveCmssyLayoutSlot(CONFIG, {
          region,
          blocks: [],
          editMode: false,
          path: [],
          layoutStore,
        }),
      ),
    );

    expect(fetchLayouts).toHaveBeenCalledTimes(1);
    expect(slots.map((slot) => slot.settings)).toEqual([
      null,
      { width: 18, sticky: true },
      null,
    ]);
  });

  it("fetches once per region when no store is passed, which is what every adapter but next still does", async () => {
    setup();

    for (const region of ["header", "sidebar_left", "footer"]) {
      await resolveCmssyLayoutSlot(CONFIG, {
        region,
        blocks: [],
        editMode: false,
        path: [],
      });
    }

    expect(fetchLayouts).toHaveBeenCalledTimes(3);
  });

  it("keeps the draft and the published layout apart in one store", async () => {
    setup();
    const layoutStore = createCmssyLayoutStore();

    await resolveCmssyLayoutSlot(CONFIG, {
      region: "header",
      blocks: [],
      editMode: true,
      path: [],
      layoutStore,
    });
    await resolveCmssyLayoutSlot(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: [],
      layoutStore,
    });

    expect(fetchLayouts).toHaveBeenCalledTimes(2);
    expect(fetchLayouts.mock.calls.map((call) => call[2].previewSecret)).toEqual(
      [CONFIG.draftSecret, undefined],
    );
  });

  it("keeps two pages apart in one store", async () => {
    setup();
    const layoutStore = createCmssyLayoutStore();

    await resolveCmssyLayoutSlot(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: [],
      layoutStore,
    });
    await resolveCmssyLayoutSlot(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: ["about"],
      layoutStore,
    });

    expect(fetchLayouts).toHaveBeenCalledTimes(2);
    expect(fetchLayouts.mock.calls.map((call) => call[1])).toEqual([
      "/",
      "/about",
    ]);
  });

  it("lets the three regions share one failure instead of asking three times", async () => {
    setup();
    const refused = new Error("cmssy: layouts fetch failed (429)");
    fetchLayouts.mockRejectedValue(refused);
    const layoutStore = createCmssyLayoutStore();

    const outcomes = await Promise.allSettled(
      ["header", "sidebar_left", "footer"].map((region) =>
        resolveCmssyLayoutSlot(CONFIG, {
          region,
          blocks: [],
          editMode: false,
          path: [],
          layoutStore,
        }),
      ),
    );

    expect(fetchLayouts).toHaveBeenCalledTimes(1);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "rejected",
      "rejected",
      "rejected",
    ]);
  });
});
