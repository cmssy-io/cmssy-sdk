import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { defineCmssyConfig, defineCmssyLayout, fields } from "@cmssy/core";
import { CmssyServerLayout } from "../components/cmssy-server-layout";
import {
  resolveCmssyLayout,
  type CmssyLayoutResolution,
} from "../components/resolve-layout";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: "shop",
  draftSecret: "draft-secret-1234",
  editorOrigin: "https://app.cmssy.io",
};

const GROUPS = [
  {
    region: "sidebar",
    blocks: [
      {
        id: "b1",
        type: "docs-sidebar",
        content: { en: {} },
        order: 0,
        isActive: true,
      },
    ],
    settings: { width: 18 },
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

function setup() {
  fetchLayouts.mockResolvedValue(GROUPS);
  resolveSiteLocales.mockResolvedValue({
    defaultLocale: "en",
    locales: ["en", "no"],
  });
}

const Editable = () => null;

afterEach(() => vi.clearAllMocks());

describe("resolveCmssyLayout", () => {
  it("returns groups, the region's settings, the routed page and a server element - one fetch", async () => {
    setup();

    const layout = await resolveCmssyLayout(CONFIG, {
      region: "sidebar",
      blocks: [],
      editMode: false,
      path: ["no", "docs"],
    });

    expect(layout.groups).toBe(GROUPS);
    expect(layout.settings).toStrictEqual({ width: 18 });
    expect(layout.page).toStrictEqual({ slug: "/docs", path: ["docs"] });
    expect(layout.locale).toBe("no");
    expect(layout.element.type).toBe(CmssyServerLayout);
    expect(layout.element.props).toMatchObject({
      groups: GROUPS,
      region: "sidebar",
      page: { slug: "/docs", path: ["docs"] },
      locale: "no",
      defaultLocale: "en",
      enabledLocales: ["en", "no"],
      config: CONFIG,
    });
    expect(fetchLayouts).toHaveBeenCalledTimes(1);
  });

  it("builds the editable element with the resolved editor data and the page, in edit mode", async () => {
    setup();

    const layout = await resolveCmssyLayout(CONFIG, {
      region: "sidebar",
      blocks: [],
      editMode: true,
      editable: Editable,
      path: ["docs"],
      appContext: { flag: true },
    });

    expect(layout.element.type).toBe(Editable);
    expect(layout.element.props).toMatchObject({
      groups: GROUPS,
      region: "sidebar",
      page: { slug: "/docs", path: ["docs"] },
      edit: { editorOrigin: CONFIG.editorOrigin },
      appContext: { flag: true },
    });
    expect(layout.element.props.resolvedContent).toHaveProperty("b1");
    expect(layout.element.props.data).toBeDefined();
  });

  it("renders a preview visitor's draft server-side, as the public layout with preview on", async () => {
    setup();

    const layout = await resolveCmssyLayout(CONFIG, {
      region: "sidebar",
      blocks: [],
      editMode: false,
      preview: true,
      path: [],
    });

    expect(fetchLayouts).toHaveBeenCalledWith(
      CONFIG,
      "/",
      expect.objectContaining({ previewSecret: CONFIG.draftSecret }),
    );
    expect(layout.element.type).toBe(CmssyServerLayout);
    expect(layout.element.props.preview).toBe(true);
  });

  it("refuses edit mode without an editable component instead of rendering a dead bridge", async () => {
    setup();

    await expect(
      resolveCmssyLayout(CONFIG, {
        region: "sidebar",
        blocks: [],
        editMode: true,
        path: [],
      }),
    ).rejects.toThrow("resolveCmssyLayout needs an `editable` component");
    expect(fetchLayouts).not.toHaveBeenCalled();
  });

  it("types settings from the declared region", () => {
    const layout = defineCmssyLayout({
      regions: [
        { id: "header" },
        { id: "sidebar", settings: { width: fields.number() } },
      ],
    });
    const declared = defineCmssyConfig({ ...CONFIG, layout });
    expectTypeOf<
      CmssyLayoutResolution<typeof declared, "sidebar">["settings"]
    >().toEqualTypeOf<{ width?: number } | null>();
    expectTypeOf<
      CmssyLayoutResolution<typeof declared, "header">["settings"]
    >().toEqualTypeOf<Record<string, never> | null>();
    const bare = defineCmssyConfig(CONFIG);
    expectTypeOf<
      CmssyLayoutResolution<typeof bare, string>["settings"]
    >().toEqualTypeOf<Record<string, unknown> | null>();
  });
});
