import { afterEach, describe, expect, it, vi } from "vitest";
import { CmssyServerLayout } from "@cmssy/react";
import { CmssyLayoutSlot } from "../preset/cmssy-layout-slot";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: "shop",
  draftSecret: "draft-secret-1234",
  editorOrigin: "https://app.cmssy.io",
};

const GROUPS = [
  { position: "header", blocks: [{ id: "b1", type: "site-header" }] },
];

const headersMock = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: headersMock }));

const resolveCmssyLayoutSlot = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/react", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, resolveCmssyLayoutSlot };
});

function setup(overrides: Record<string, unknown> = {}) {
  resolveCmssyLayoutSlot.mockResolvedValue({
    groups: GROUPS,
    locale: "en",
    defaultLocale: "en",
    enabledLocales: ["en", "no"],
    path: [],
    ...overrides,
  });
  headersMock.mockResolvedValue(new Headers());
}

const Editable = () => null;

afterEach(() => {
  vi.clearAllMocks();
});

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
    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ editMode: false, page: "/", path: [] }),
    );
  });

  it("takes the language from the routed path, without reading headers", async () => {
    setup({ locale: "no", path: ["about"] });
    const element = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: ["no", "about"],
      editMode: false,
      editable: Editable,
    });

    expect(element.props.locale).toBe("no");
    expect(headersMock).not.toHaveBeenCalled();
    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ path: ["no", "about"] }),
    );
  });

  it("takes an explicit locale where there are no params to read", async () => {
    setup({ locale: "no" });

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
    setup({
      data: { b1: { categories: [] } },
      resolvedContent: { b1: { heading: "Shop" } },
      editorOrigin: CONFIG.editorOrigin,
    });

    const element = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: [],
      editMode: true,
      editable: Editable,
    });

    expect(element.type).toBe(Editable);
    expect(element.props.data).toEqual({ b1: { categories: [] } });
    expect(element.props.resolvedContent).toEqual({ b1: { heading: "Shop" } });
    expect(element.props.edit).toEqual({ editorOrigin: CONFIG.editorOrigin });
  });

  it("hands the bridge every editor origin, not just the first (CMS-1096)", async () => {
    const origins = ["https://cmssy.io", "https://www.cmssy.io"];
    setup({ editorOrigin: origins });

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

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ retry: {} }),
    );
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

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({
        retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
      }),
    );
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

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ retry: false }),
    );
  });
});
