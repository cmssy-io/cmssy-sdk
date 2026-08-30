import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CMSSY_EDIT_HEADER,
  defineCmssyLayout,
  type CmssyConfig,
} from "@cmssy/core";
import { loadCmssyPage } from "../page";

const DRAFT_SECRET = "draft-secret-1234";
const CONFIG = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
  draftSecret: DRAFT_SECRET,
} as unknown as CmssyConfig;

const resolveCmssyLayoutSlot = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/react", () => ({ resolveCmssyLayoutSlot }));

const fetchPage = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/core/internal", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, fetchPage };
});

function slotFor(position: string, editMode: boolean) {
  return {
    groups: [{ position, blocks: [] }],
    locale: "en",
    defaultLocale: "en",
    enabledLocales: ["en"],
    path: ["about"],
    page: { slug: "/about", path: ["about"] },
    ...(editMode
      ? {
          data: { [`${position}-block`]: { categories: [] } },
          resolvedContent: { [`${position}-block`]: { heading: position } },
          editorOrigin: "https://cmssy.io",
        }
      : {}),
  };
}

afterEach(() => vi.clearAllMocks());

describe("loadCmssyPage", () => {
  it("exposes the routed page the layout blocks were resolved for (CMS-1708)", async () => {
    resolveCmssyLayoutSlot.mockImplementation((_config, options) =>
      Promise.resolve(slotFor(options.position, options.editMode)),
    );
    fetchPage.mockResolvedValue({ id: "p1" });
    const result = await loadCmssyPage(
      CONFIG,
      new Request("https://site.test/about"),
      new URL("https://site.test/about"),
      { blocks: [] },
    );
    expect(result.pageContext).toStrictEqual({
      slug: "/about",
      path: ["about"],
    });
  });

  it("resolves editor data for every declared region, not the header/footer pair", async () => {
    resolveCmssyLayoutSlot.mockImplementation((_config, options) =>
      Promise.resolve(slotFor(options.position, options.editMode)),
    );
    fetchPage.mockResolvedValue({ id: "p1" });
    const layout = defineCmssyLayout({
      regions: [{ id: "header" }, { id: "promo" }],
    });
    const request = new Request("https://site.test/about", {
      headers: { [CMSSY_EDIT_HEADER]: "1" },
    });
    const result = await loadCmssyPage(
      { ...CONFIG, layout },
      request,
      new URL("https://site.test/about"),
      { blocks: [] },
    );
    expect(Object.keys(result.editorData ?? {})).toEqual(["header", "promo"]);
  });

  it("hands the declared layout regions to the page, and nothing when undeclared", async () => {
    resolveCmssyLayoutSlot.mockImplementation((_config, options) =>
      Promise.resolve(slotFor(options.position, options.editMode)),
    );
    fetchPage.mockResolvedValue({ id: "p1" });
    const request = new Request("https://site.test/about");
    const url = new URL("https://site.test/about");
    const layout = defineCmssyLayout({ regions: [{ id: "header" }] });
    const declared = await loadCmssyPage({ ...CONFIG, layout }, request, url, {
      blocks: [],
    });
    expect(declared.layoutRegions).toEqual([{ id: "header" }]);
    const bare = await loadCmssyPage(CONFIG, request, url, { blocks: [] });
    expect("layoutRegions" in bare).toBe(false);
  });

  it("resolves the editor data for every position, not just the first", async () => {
    resolveCmssyLayoutSlot.mockImplementation((_config, options) =>
      Promise.resolve(slotFor(options.position, options.editMode)),
    );
    fetchPage.mockResolvedValue({ id: "p1" });

    const request = new Request("https://site.test/about", {
      headers: { [CMSSY_EDIT_HEADER]: "1" },
    });
    const result = await loadCmssyPage(
      CONFIG,
      request,
      new URL("https://site.test/about"),
      { blocks: [] },
    );

    expect(Object.keys(result.editorData ?? {})).toEqual(["header", "footer"]);
    expect(result.editorData?.footer?.resolvedContent).toEqual({
      "footer-block": { heading: "footer" },
    });
    expect(result.isEdit).toBe(true);
  });

  it("resolves nothing for the editor on a published request", async () => {
    resolveCmssyLayoutSlot.mockImplementation((_config, options) =>
      Promise.resolve(slotFor(options.position, options.editMode)),
    );
    fetchPage.mockResolvedValue({ id: "p1" });

    const result = await loadCmssyPage(
      CONFIG,
      new Request("https://site.test/about"),
      new URL("https://site.test/about"),
      { blocks: [] },
    );

    expect(result.editorData).toBeUndefined();
    expect(resolveCmssyLayoutSlot).toHaveBeenCalledTimes(1);
  });

  it("fetches the page by the locale-stripped slug the resolver returned", async () => {
    resolveCmssyLayoutSlot.mockResolvedValue(slotFor("header", false));
    fetchPage.mockResolvedValue(null);

    await loadCmssyPage(
      CONFIG,
      new Request("https://site.test/no/about"),
      new URL("https://site.test/no/about"),
    );

    expect(fetchPage).toHaveBeenCalledWith(CONFIG, ["about"], {
      previewSecret: undefined,
      retry: "build",
    });
  });
});

describe("loadCmssyPage path handling", () => {
  it("does not slice the edit prefix out of a page slugged like it", async () => {
    resolveCmssyLayoutSlot.mockImplementation((_config, options) =>
      Promise.resolve(slotFor(options.position, options.editMode)),
    );
    fetchPage.mockResolvedValue({ id: "p1" });

    const url = new URL("https://site.test/cmssy-editorial");
    await loadCmssyPage(CONFIG, new Request(url), url, { blocks: [] });

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ path: ["cmssy-editorial"] }),
    );
  });

  it("strips the edit prefix when it really is one", async () => {
    resolveCmssyLayoutSlot.mockImplementation((_config, options) =>
      Promise.resolve(slotFor(options.position, options.editMode)),
    );
    fetchPage.mockResolvedValue({ id: "p1" });

    const url = new URL("https://site.test/cmssy-edit/no/blog");
    await loadCmssyPage(CONFIG, new Request(url), url, { blocks: [] });

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ path: ["no", "blog"] }),
    );
  });
});

describe("loadCmssyPage edit-mode detection", () => {
  it("treats a verified edit URL as edit mode, with no header at all", async () => {
    resolveCmssyLayoutSlot.mockImplementation((_config, options) =>
      Promise.resolve(slotFor(options.position, options.editMode)),
    );
    fetchPage.mockResolvedValue({ id: "p1" });

    const url = new URL(
      "https://site.test/cmssy-edit/about?cmssyEdit=1&cmssySecret=draft-secret-1234",
    );
    const result = await loadCmssyPage(CONFIG, new Request(url), url, {
      blocks: [],
    });

    expect(result.isEdit).toBe(true);
    expect(fetchPage).toHaveBeenCalledWith(CONFIG, ["about"], {
      previewSecret: DRAFT_SECRET,
      retry: "build",
    });
    expect(result.editorData?.header).toBeDefined();
  });

  it("does not open edit mode for an unverified URL", async () => {
    resolveCmssyLayoutSlot.mockImplementation((_config, options) =>
      Promise.resolve(slotFor(options.position, options.editMode)),
    );
    fetchPage.mockResolvedValue({ id: "p1" });

    const url = new URL(
      "https://site.test/cmssy-edit/about?cmssyEdit=1&cmssySecret=wrong",
    );
    const result = await loadCmssyPage(CONFIG, new Request(url), url, {
      blocks: [],
    });

    expect(result.isEdit).toBe(false);
    expect(result.editorData).toBeUndefined();
  });
});

describe("loadCmssyPage retry policy (CMS-1460)", () => {
  function arrange() {
    resolveCmssyLayoutSlot.mockImplementation((_config, options) =>
      Promise.resolve(slotFor(options.position, options.editMode)),
    );
    fetchPage.mockResolvedValue({ id: "p1" });
    return new URL("https://site.test/about");
  }

  it("uses the build mode for the layout slot and the page fetch by default", async () => {
    const url = arrange();

    await loadCmssyPage(CONFIG, new Request(url), url, { blocks: [] });

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ retry: "build" }),
    );
    expect(fetchPage).toHaveBeenCalledWith(CONFIG, ["about"], {
      previewSecret: undefined,
      retry: "build",
    });
  });

  it("forwards an explicit policy to both delivery calls", async () => {
    const url = arrange();

    await loadCmssyPage(CONFIG, new Request(url), url, {
      blocks: [],
      retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
    });

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({
        retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
      }),
    );
    expect(fetchPage).toHaveBeenCalledWith(CONFIG, ["about"], {
      previewSecret: undefined,
      retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
    });
  });

  it("turns retry off for both delivery calls when the caller passes false", async () => {
    const url = arrange();

    await loadCmssyPage(CONFIG, new Request(url), url, {
      blocks: [],
      retry: false,
    });

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ retry: false }),
    );
    expect(fetchPage).toHaveBeenCalledWith(CONFIG, ["about"], {
      previewSecret: undefined,
      retry: false,
    });
  });
});

describe("loadCmssyPage render mode (CMS-1463)", () => {
  function arrange() {
    resolveCmssyLayoutSlot.mockImplementation((_config, options) =>
      Promise.resolve(slotFor(options.position, options.editMode)),
    );
    fetchPage.mockResolvedValue({ id: "p1" });
    return new URL("https://site.test/about");
  }

  it("waits generously on a prerendered page", async () => {
    const url = arrange();

    await loadCmssyPage(CONFIG, new Request(url), url, {
      blocks: [],
      prerendered: true,
    });

    expect(fetchPage).toHaveBeenCalledWith(CONFIG, ["about"], {
      previewSecret: undefined,
      retry: "build",
    });
  });

  it("fails fast on a page rendered on demand", async () => {
    const url = arrange();

    await loadCmssyPage(CONFIG, new Request(url), url, {
      blocks: [],
      prerendered: false,
    });

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ retry: "interactive" }),
    );
    expect(fetchPage).toHaveBeenCalledWith(CONFIG, ["about"], {
      previewSecret: undefined,
      retry: "interactive",
    });
  });

  it("an explicit policy still wins over the render mode", async () => {
    const url = arrange();

    await loadCmssyPage(CONFIG, new Request(url), url, {
      blocks: [],
      prerendered: false,
      retry: { maxRetries: 7 },
    });

    expect(fetchPage).toHaveBeenCalledWith(CONFIG, ["about"], {
      previewSecret: undefined,
      retry: { maxRetries: 7 },
    });
  });
});
