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

const GROUPS = [{ position: "header", blocks: [{ id: "b1", type: "site-header" }] }];

let editMode = false;
let headerLocale: string | null = null;

vi.mock("../edit-mode", () => ({ isCmssyEditMode: async () => editMode }));

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

const resolveEditorLayoutBlockData = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/react", async (importActual) => {
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
  headersMock.mockResolvedValue(
    new Headers(headerLocale ? { "x-cmssy-locale": headerLocale } : {}),
  );
}

const Editable = () => null;

afterEach(() => {
  editMode = false;
  headerLocale = null;
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
      editable: Editable,
    });

    expect(element.type).toBe(CmssyServerLayout);
    expect(element.props.groups).toBe(GROUPS);
    // No preview secret on a public render, or the site serves draft chrome.
    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: undefined,
    });
  });

  it("takes the language from the routed path, without reading headers", async () => {
    setup();

    const element = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: ["no", "about"],
      editable: Editable,
    });

    expect(element.props.locale).toBe("no");
    // Reading headers() here would make every page dynamic - the reason the
    // 10.0 version of this component was removed.
    expect(headersMock).not.toHaveBeenCalled();
  });

  it("falls back to the middleware's header when there is no path", async () => {
    headerLocale = "no";
    setup();

    const element = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      editable: Editable,
    });

    expect(element.props.locale).toBe("no");
    expect(headersMock).toHaveBeenCalled();
  });

  it("goes through the edit bridge with the draft, in edit mode", async () => {
    editMode = true;
    setup();

    const element = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: [],
      editable: Editable,
    });

    expect(element.type).toBe(Editable);
    // The draft, not the published header - you are editing the draft.
    expect(fetchLayouts).toHaveBeenCalledWith(CONFIG, "/", {
      previewSecret: CONFIG.draftSecret,
    });
    // Both halves: the canvas renders stored content, where a relation is ids.
    expect(element.props.data).toEqual({ b1: { categories: [] } });
    expect(element.props.resolvedContent).toEqual({ b1: { heading: "Shop" } });
    expect(element.props.edit).toEqual({ editorOrigin: CONFIG.editorOrigin });
  });

  it("forwards appContext to both modes", async () => {
    setup();
    const appContext = { member: { email: "a@b.c" } };

    const published = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: [],
      editable: Editable,
      appContext,
    });
    expect(published.props.appContext).toBe(appContext);

    editMode = true;
    const editing = await CmssyLayoutSlot({
      config: CONFIG,
      blocks: [],
      position: "header",
      path: [],
      editable: Editable,
      appContext,
    });
    expect(editing.props.appContext).toBe(appContext);
  });
});
