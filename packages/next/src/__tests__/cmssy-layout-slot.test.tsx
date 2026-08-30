import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { ReactElement } from "react";
import {
  defineCmssyConfig,
  defineCmssyLayout,
  fields,
  type CmssyBlockContext,
} from "@cmssy/core";
import { CmssyServerLayout, defineBlock } from "@cmssy/react";
import {
  CmssyLayoutSlot,
  type CmssyLayoutSlotProps,
  type CmssyLayoutSlotRenderProps,
} from "../preset/cmssy-layout-slot";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: "shop",
  draftSecret: "draft-secret-1234",
  editorOrigin: "https://app.cmssy.io",
};

const GROUPS = [
  {
    position: "header",
    blocks: [
      {
        id: "b1",
        type: "site-header",
        content: { en: { brand: "Shop" } },
        order: 0,
        isActive: true,
      },
    ],
    settings: { sticky: true },
  },
];

const Header = ({
  content,
  data,
}: {
  content: { brand?: string };
  data?: unknown;
}) => (
  <header data-page={JSON.stringify(data ?? null)}>{content.brand}</header>
);

const blocks = [
  defineBlock({
    type: "site-header",
    label: "Header",
    component: Header,
    layoutPositions: ["header"],
    props: { brand: fields.text() },
    loader: async ({ context }: { context?: CmssyBlockContext }) =>
      context?.page ?? null,
  }),
];

const headersMock = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: headersMock }));

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
  headersMock.mockResolvedValue(new Headers());
}

const Editable = () => null;

afterEach(() => {
  vi.clearAllMocks();
});

async function renderServerElement(element: ReactElement) {
  const inner = await (
    element.type as (props: unknown) => Promise<ReactElement>
  )(element.props);
  return JSON.stringify(inner);
}

describe("CmssyLayoutSlot", () => {
  it("server-renders the layout blocks for a visitor", async () => {
    setup();

    const element = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: [],
      editMode: false,
      editable: Editable,
    });

    expect(element.type).toBe(CmssyServerLayout);
    expect(element.props.groups).toBe(GROUPS);
    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: undefined,
      retry: "interactive",
    });
  });

  it("leaves the page slug to the resolver so the routed path decides which layouts apply", async () => {
    setup();

    const element = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: ["pricing"],
      editMode: false,
      editable: Editable,
    });

    expect(fetchLayouts).toHaveBeenCalledWith(
      CONFIG,
      "/pricing",
      expect.anything(),
    );
    expect(element.props.page).toStrictEqual({
      slug: "/pricing",
      path: ["pricing"],
    });
  });

  it("forwards an explicit page slug over the routed path", async () => {
    setup();

    await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: ["pricing"],
      page: "/about",
      editMode: false,
      editable: Editable,
    });

    expect(fetchLayouts).toHaveBeenCalledWith(
      CONFIG,
      "/about",
      expect.anything(),
    );
  });

  it("takes the language from the routed path, without reading headers", async () => {
    setup();
    const element = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: ["no", "about"],
      editMode: false,
      editable: Editable,
    });

    expect(element.props.locale).toBe("no");
    expect(element.props.page).toStrictEqual({
      slug: "/about",
      path: ["about"],
    });
    expect(headersMock).not.toHaveBeenCalled();
  });

  it("takes an explicit locale where there are no params to read", async () => {
    setup();

    const element = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      locale: "no",
      editMode: false,
      editable: Editable,
    });

    expect(element.props.locale).toBe("no");
    expect(headersMock).not.toHaveBeenCalled();
  });

  it("goes through the edit bridge with the draft, in edit mode", async () => {
    setup();

    const element = await CmssyLayoutSlot({
      config: CONFIG,
      blocks,
      position: "header",
      path: ["docs"],
      editMode: true,
      editable: Editable,
    });

    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/docs", {
      previewSecret: CONFIG.draftSecret,
      retry: "interactive",
    });
    expect(element.type).toBe(Editable);
    expect(element.props.data).toStrictEqual({
      b1: { slug: "/docs", path: ["docs"], pageType: null },
    });
    expect(element.props.resolvedContent).toStrictEqual({
      b1: { brand: "Shop" },
    });
    expect(element.props.page).toStrictEqual({
      slug: "/docs",
      path: ["docs"],
    });
    expect(element.props.edit).toEqual({ editorOrigin: CONFIG.editorOrigin });
  });

  it("hands the bridge every editor origin, not just the first (CMS-1096)", async () => {
    const origins = ["https://cmssy.io", "https://www.cmssy.io"];
    setup();

    const element = await CmssyLayoutSlot({
      config: { ...CONFIG, editorOrigin: origins },
      blocks: [],
      position: "header",
      path: [],
      editMode: true,
      editable: Editable,
    });

    expect(element.props.edit).toEqual({ editorOrigin: origins });
  });

  it("forwards appContext to both modes", async () => {
    setup();
    const appContext = { member: { email: "a@b.c" } };

    const published = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: [],
      editMode: false,
      editable: Editable,
      appContext,
    });
    expect(published.props.appContext).toBe(appContext);

    const editing = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: [],
      editMode: true,
      editable: Editable,
      appContext,
    });
    expect(editing.props.appContext).toBe(appContext);
  });
});

describe("CmssyLayoutSlot render prop (CMS-1708)", () => {
  it("hands children the groups, the region's settings and the routed page from one fetch", async () => {
    setup();
    let received: CmssyLayoutSlotRenderProps | undefined;

    await CmssyLayoutSlot({
      config: CONFIG,
      blocks,
      position: "header",
      path: ["docs"],
      editMode: false,
      editable: Editable,
      children: (layout) => {
        received = layout;
        return null;
      },
    });

    expect(received?.groups).toBe(GROUPS);
    expect(received?.settings).toStrictEqual({ sticky: true });
    expect(received?.page).toStrictEqual({ slug: "/docs", path: ["docs"] });
    expect(fetchLayouts).toHaveBeenCalledTimes(1);
    expect(resolveSiteLocales).toHaveBeenCalledTimes(1);
  });

  it("gives children the element the plain form would have rendered - same markup", async () => {
    setup();
    let received: CmssyLayoutSlotRenderProps | undefined;
    const shared = {
      config: CONFIG,
      blocks,
      position: "header",
      path: ["docs"],
      editMode: false,
      editable: Editable,
    };

    const plain = await CmssyLayoutSlot(shared);
    await CmssyLayoutSlot({
      ...shared,
      children: (layout) => {
        received = layout;
        return null;
      },
    });

    expect(received?.element).toEqual(plain);
    const tree = await renderServerElement(received!.element);
    expect(tree).toBe(await renderServerElement(plain));
    expect(tree).toContain('"brand":"Shop"');
    expect(tree).toContain('"data":{"slug":"/docs","path":["docs"],"pageType":null}');
  });

  it("returns what children render, wrapped so the slot stays a single node", async () => {
    setup();

    const rendered = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: [],
      editMode: false,
      editable: Editable,
      children: ({ settings }) => (
        <aside data-sticky={String(settings?.sticky)}>slot</aside>
      ),
    });

    expect(rendered.props.children).toEqual(
      <aside data-sticky="true">slot</aside>,
    );
  });

  it("in edit mode, the element is the editable with data and resolvedContent already resolved", async () => {
    setup();
    let received: CmssyLayoutSlotRenderProps | undefined;

    await CmssyLayoutSlot({
      config: CONFIG,
      blocks,
      position: "header",
      path: ["docs"],
      editMode: true,
      editable: Editable,
      children: (layout) => {
        received = layout;
        return null;
      },
    });

    expect(received?.element.type).toBe(Editable);
    expect(received?.element.props.data).toStrictEqual({
      b1: { slug: "/docs", path: ["docs"], pageType: null },
    });
    expect(received?.element.props.resolvedContent).toStrictEqual({
      b1: { brand: "Shop" },
    });
    expect(received?.settings).toStrictEqual({ sticky: true });
    expect(fetchLayouts).toHaveBeenCalledTimes(1);
  });

  it("reports null settings for a region the layouts do not carry", async () => {
    setup();
    let received: CmssyLayoutSlotRenderProps | undefined;

    await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "footer",
      path: [],
      editMode: false,
      editable: Editable,
      children: (layout) => {
        received = layout;
        return null;
      },
    });

    expect(received?.settings).toBeNull();
    expect(received?.groups).toBe(GROUPS);
  });
});

describe("CmssyLayoutSlot retry policy (CMS-1460)", () => {
  it("retries the layout resolution by default", async () => {
    setup();

    await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: [],
      editMode: false,
      editable: Editable,
    });

    expect(resolveSiteLocales).toHaveBeenCalledWith(CONFIG, {
      retry: "interactive",
    });
  });

  it("forwards an explicit policy", async () => {
    setup();

    await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: [],
      editMode: false,
      editable: Editable,
      retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
    });

    expect(resolveSiteLocales).toHaveBeenCalledWith(CONFIG, {
      retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
    });
  });

  it("turns retry off when the caller passes false", async () => {
    setup();

    await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: [],
      editMode: false,
      editable: Editable,
      retry: false,
    });

    expect(resolveSiteLocales).toHaveBeenCalledWith(CONFIG, { retry: false });
  });
});

describe("CmssyLayoutSlot position typing", () => {
  it("narrows position to the regions the config declares", () => {
    const layout = defineCmssyLayout({
      regions: [{ id: "header" }, { id: "sidebar_left" }],
    });
    const declared = defineCmssyConfig({ ...CONFIG, layout });
    expectTypeOf<
      CmssyLayoutSlotProps<typeof declared>["position"]
    >().toEqualTypeOf<"header" | "sidebar_left">();
    const undeclared = defineCmssyConfig(CONFIG);
    expectTypeOf<
      CmssyLayoutSlotProps<typeof undeclared>["position"]
    >().toEqualTypeOf<string>();
  });

  it("types the render prop's settings from the declared region", () => {
    const layout = defineCmssyLayout({
      regions: [
        { id: "header" },
        { id: "sidebar", settings: { width: fields.number() } },
      ],
    });
    const declared = defineCmssyConfig({ ...CONFIG, layout });
    expectTypeOf<
      CmssyLayoutSlotRenderProps<typeof declared, "sidebar">["settings"]
    >().toEqualTypeOf<{ width?: number } | null>();
  });
});
