import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CmssyServerPage, defineBlock, type CmssyPageData } from "@cmssy/react";
import { CmssyLocaleProvider } from "@cmssy/react/internal";

function unwrap(element: { type: unknown; props: { children: unknown } }) {
  expect(element.type).toBe(CmssyLocaleProvider);
  return element.props.children as {
    type: unknown;
    props: Record<string, unknown>;
  };
}

let draftEnabled = false;

vi.mock("next/headers", () => ({
  draftMode: vi.fn(async () => ({ isEnabled: draftEnabled })),
  headers: vi.fn(async () => new Headers({ host: "localhost:3000" })),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const fetchPage = vi.hoisted(() => vi.fn());
const resolveSiteLocales = vi.hoisted(() => vi.fn());
const resolveWorkspaceId = vi.hoisted(() => vi.fn());
const resolveForms = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/react", async (importActual) => {
  const actual = await importActual<typeof import("@cmssy/react")>();
  return {
    ...actual,
    createCmssyClient: () => ({ resolveWorkspaceId }),
  };
});
vi.mock("@cmssy/core/internal", async (importActual) => {
  const actual = await importActual<typeof import("@cmssy/core/internal")>();
  return {
    ...actual,
    fetchPage,
    resolveSiteLocales,
    resolveForms,
  };
});

import { createCmssyPage, createCmssyEditPage } from "../create-cmssy-page";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: "pilot",
  draftSecret: "draft-secret-1234",
  editorOrigin: "https://app.cmssy.io",
};

const PAGE: CmssyPageData = {
  id: "page-1",
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

const Editor = () => null;

function params(path?: string[]) {
  return Promise.resolve({ path });
}

function searchParams(sp: Record<string, string | string[]> = {}) {
  return Promise.resolve(sp);
}

describe("createCmssyPage", () => {
  beforeEach(() => {
    vi.stubEnv("CMSSY_EDITOR_ORIGIN", "");
    vi.stubEnv("NODE_ENV", "production");
    draftEnabled = false;
    fetchPage.mockReset();
    resolveSiteLocales.mockReset();
    resolveSiteLocales.mockResolvedValue({
      defaultLocale: "en",
      locales: ["en"],
    });
    resolveWorkspaceId.mockReset();
    resolveWorkspaceId.mockResolvedValue("ws_123");
    resolveForms.mockReset();
    resolveForms.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("strips a non-default locale prefix from the workspace site config", async () => {
    resolveSiteLocales.mockResolvedValue({
      defaultLocale: "pl",
      locales: ["pl", "en"],
    });
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS);
    const element = unwrap(await Page({ params: params(["en", "about"]) }));
    expect(element.type).toBe(CmssyServerPage);
    expect(element.props.locale).toBe("en");
    expect(element.props.defaultLocale).toBe("pl");
    expect(element.props.enabledLocales).toEqual(["pl", "en"]);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
      retry: {},
    });
  });

  it("renders the default locale at the root path", async () => {
    resolveSiteLocales.mockResolvedValue({
      defaultLocale: "pl",
      locales: ["pl", "en"],
    });
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS);
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(element.props.locale).toBe("pl");
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
      retry: {},
    });
  });

  it("renders the RSC server page with the passed blocks for published content", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS);
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(element.type).toBe(CmssyServerPage);
    expect(element.props.blocks).toBe(BLOCKS);
    expect(fetchPage).toHaveBeenCalledWith(
      {
        apiUrl: CONFIG.apiUrl,
        org: CONFIG.org,
        workspaceSlug: CONFIG.workspaceSlug,
      },
      ["about"],
      { previewSecret: undefined, retry: {} },
    );
  });

  it("renders draft CONTENT without the editor in draft-mode preview (CMS-948)", async () => {
    draftEnabled = true;
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(await Page({ params: params([]) }));
    expect(element.type).toBe(CmssyServerPage);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), [], {
      previewSecret: CONFIG.draftSecret,
      retry: {},
    });
  });

  it("renders the consumer editor for a verified editor request", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyEditPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({
        params: params([]),
        searchParams: searchParams({
          cmssyEdit: "1",
          cmssySecret: CONFIG.draftSecret,
        }),
      }),
    );
    expect(element.type).toBe(Editor);
    expect(element.props.page).toBe(PAGE);
    expect(element.props.edit).toEqual({
      editorOrigin: "https://app.cmssy.io",
    });
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), [], {
      previewSecret: CONFIG.draftSecret,
      retry: {},
    });
  });

  it("throws for a verified editor request when no editor is provided", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyEditPage(CONFIG, BLOCKS);
    await expect(
      Page({
        params: params([]),
        searchParams: searchParams({
          cmssyEdit: "1",
          cmssySecret: CONFIG.draftSecret,
        }),
      }),
    ).rejects.toThrow(/edit\/dev mode requires options\.editor/);
  });

  it("does not throw in draft-mode preview without an editor", async () => {
    draftEnabled = true;
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS);
    const element = unwrap(await Page({ params: params([]) }));
    expect(element.type).toBe(CmssyServerPage);
  });

  it("enters edit mode via cmssyEdit + matching cmssySecret without draft mode", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyEditPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({
          cmssyEdit: "1",
          cmssySecret: CONFIG.draftSecret,
        }),
      }),
    );
    expect(element.type).toBe(Editor);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: CONFIG.draftSecret,
      retry: {},
    });
  });

  it("stays published for a bare cmssyEdit=1 without cmssySecret (CMS-948)", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({ cmssyEdit: "1" }),
      }),
    );
    expect(element.type).toBe(CmssyServerPage);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
      retry: {},
    });
  });

  it("stays published for cmssyEdit=1 with a wrong cmssySecret (CMS-948)", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({ cmssyEdit: "1", cmssySecret: "wrong" }),
      }),
    );
    expect(element.type).toBe(CmssyServerPage);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
      retry: {},
    });
  });

  it("sends devPreview in development with a dev token (standalone dev render)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(
      { ...CONFIG, devToken: "cs_devtoken" },
      BLOCKS,
      { editor: Editor },
    );
    const element = unwrap(
      await Page({ params: params(["about"]), searchParams: searchParams({}) }),
    );
    expect(element.type).not.toBe(Editor);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
      retry: {},
      devPreview: true,
      devToken: "cs_devtoken",
      workspaceId: "ws_123",
    });
  });

  it("enters the editor with a dev token and cmssyEdit, still sending devPreview", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyEditPage(
      { ...CONFIG, devToken: "cs_devtoken" },
      BLOCKS,
      { editor: Editor },
    );
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({
          cmssyEdit: "1",
          cmssySecret: CONFIG.draftSecret,
        }),
      }),
    );
    expect(element.type).toBe(Editor);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: CONFIG.draftSecret,
      retry: {},
      devPreview: true,
      devToken: "cs_devtoken",
      workspaceId: "ws_123",
    });
  });

  it("does not send devPreview without a dev token", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({ params: params(["about"]), searchParams: searchParams({}) }),
    );
    expect(element.type).not.toBe(Editor);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
      retry: {},
      devPreview: undefined,
      devToken: undefined,
      workspaceId: undefined,
    });
  });

  it("does not send devPreview outside development even with a dev token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(
      { ...CONFIG, devToken: "cs_devtoken" },
      BLOCKS,
      { editor: Editor },
    );
    const element = unwrap(
      await Page({ params: params(["about"]), searchParams: searchParams({}) }),
    );
    expect(element.type).not.toBe(Editor);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
      retry: {},
      devPreview: undefined,
      devToken: undefined,
      workspaceId: undefined,
    });
  });

  it("enters edit mode when cmssyEdit arrives as a repeated (array) param", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyEditPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({
          cmssyEdit: ["1", "1"],
          cmssySecret: CONFIG.draftSecret,
        }),
      }),
    );
    expect(element.type).toBe(Editor);
  });

  it("stays published when cmssyEdit is absent", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({}),
      }),
    );
    expect(element.type).toBe(CmssyServerPage);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
      retry: {},
    });
  });

  it("stays published when an array cmssyEdit contains no '1'", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({ cmssyEdit: ["0", "0"] }),
      }),
    );
    expect(element.type).toBe(CmssyServerPage);
  });

  it("the public route ignores even a VERIFIED cmssyEdit pair (rewrite owns the edit flow)", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({
          cmssyEdit: "1",
          cmssySecret: CONFIG.draftSecret,
        }),
      }),
    );
    expect(element.type).toBe(CmssyServerPage);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
      retry: {},
    });
  });

  it("the edit route 404s on a bare cmssyEdit without the secret", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyEditPage(CONFIG, BLOCKS, { editor: Editor });
    await expect(
      Page({
        params: params(["about"]),
        searchParams: searchParams({ cmssyEdit: "1" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("the edit route 404s on a wrong cmssySecret", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyEditPage(CONFIG, BLOCKS, { editor: Editor });
    await expect(
      Page({
        params: params(["about"]),
        searchParams: searchParams({ cmssyEdit: "1", cmssySecret: "wrong" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders diagnostics in development for a wrong cmssySecret", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as { query: string };
        return {
          ok: true,
          status: 200,
          json: async () =>
            body.query.includes("draftSecretValid")
              ? { data: { public: { draftSecretValid: false } } }
              : {
                  data: {
                    public: {
                      siteConfig: { previewUrl: "http://localhost:3000" },
                    },
                  },
                },
        };
      }),
    );
    const Page = createCmssyEditPage(CONFIG, BLOCKS, { editor: Editor });
    const element = (await Page({
      params: params(["about"]),
      searchParams: searchParams({ cmssyEdit: "1", cmssySecret: "wrong" }),
    })) as { props: { dangerouslySetInnerHTML: { __html: string } } };
    const html = element.props.dangerouslySetInnerHTML.__html;

    expect(html).toContain("cmssy editor diagnostics");
    expect(html).toContain("acme/pilot");
    expect(html).toContain("does not match");
    expect(html).toContain("frame-ancestors");
    expect(html).not.toContain(CONFIG.draftSecret);
    expect(fetchPage).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("renders diagnostics in development for a bare cmssyEdit without the secret", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: { public: { siteConfig: { previewUrl: null } } },
        }),
      })),
    );
    const Page = createCmssyEditPage(CONFIG, BLOCKS, { editor: Editor });
    const element = (await Page({
      params: params(["about"]),
      searchParams: searchParams({ cmssyEdit: "1" }),
    })) as { props: { dangerouslySetInnerHTML: { __html: string } } };
    const html = element.props.dangerouslySetInnerHTML.__html;

    expect(html).toContain("no cmssySecret");
    vi.unstubAllGlobals();
  });

  it("still 404s in production for a wrong cmssySecret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyEditPage(CONFIG, BLOCKS, { editor: Editor });
    await expect(
      Page({
        params: params(["about"]),
        searchParams: searchParams({ cmssyEdit: "1", cmssySecret: "wrong" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the editor in development with the right secret", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyEditPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({
          cmssyEdit: "1",
          cmssySecret: CONFIG.draftSecret,
        }),
      }),
    );
    expect(element.type).toBe(Editor);
  });

  it("calls notFound when the page is missing", async () => {
    fetchPage.mockResolvedValue(null);
    const Page = createCmssyPage(CONFIG, BLOCKS);
    await expect(Page({ params: params(["missing"]) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("threads the resolved locale", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(
      { ...CONFIG, resolveLocale: () => "pl" },
      BLOCKS,
    );
    const element = unwrap(await Page({ params: params([]) }));
    expect(element.props.locale).toBe("pl");
  });

  it("still strips the language prefix off the slug when resolveLocale is set", async () => {
    resolveSiteLocales.mockResolvedValue({
      defaultLocale: "en",
      locales: ["en", "no"],
    });
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(
      { ...CONFIG, resolveLocale: () => "no" },
      BLOCKS,
    );

    const element = unwrap(await Page({ params: params(["no", "about"]) }));

    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
      retry: {},
    });
    expect(element.props.locale).toBe("no");
  });

  it("edits a prefixed URL rather than 404ing on it", async () => {
    resolveSiteLocales.mockResolvedValue({
      defaultLocale: "en",
      locales: ["en", "no"],
    });
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyEditPage(
      { ...CONFIG, resolveLocale: () => "no" },
      BLOCKS,
      { editor: Editor },
    );

    await Page({
      params: params(["no", "about"]),
      searchParams: searchParams({
        cmssyEdit: "1",
        cmssySecret: CONFIG.draftSecret,
      }),
    });

    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: CONFIG.draftSecret,
      retry: {},
      devPreview: undefined,
      devToken: undefined,
      workspaceId: undefined,
    });
  });

  it("leaves a slug that only looks prefixed alone", async () => {
    resolveSiteLocales.mockResolvedValue({
      defaultLocale: "en",
      locales: ["en", "no"],
    });
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(
      { ...CONFIG, resolveLocale: () => "no" },
      BLOCKS,
    );

    await Page({ params: params(["de", "about"]) });

    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["de", "about"], {
      previewSecret: undefined,
      retry: {},
    });
  });

  it("rejects a wildcard editorOrigin in production when entering edit mode", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyEditPage({ ...CONFIG, editorOrigin: "*" }, BLOCKS, {
      editor: Editor,
    });
    await expect(
      Page({
        params: params(["about"]),
        searchParams: searchParams({
          cmssyEdit: "1",
          cmssySecret: CONFIG.draftSecret,
        }),
      }),
    ).rejects.toThrow(/only allowed in development/);
  });

  it("does not require editorOrigin for a published render", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage({ ...CONFIG, editorOrigin: "" }, BLOCKS);
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(element.type).toBe(CmssyServerPage);
  });

  it("resolves the root path for the index route", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS);
    await Page({ params: params(undefined) });
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), undefined, {
      previewSecret: undefined,
      retry: {},
    });
  });

  it("passes every configured origin to the bridge so any of them can frame the editor", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Page = createCmssyEditPage(
      {
        ...CONFIG,
        editorOrigin: ["https://app.cmssy.io", "https://staging.cmssy.io"],
      },
      BLOCKS,
      { editor: Editor },
    );
    const element = unwrap(
      await Page({
        params: params([]),
        searchParams: searchParams({
          cmssyEdit: "1",
          cmssySecret: CONFIG.draftSecret,
        }),
      }),
    );
    expect(element.props.edit).toEqual({
      editorOrigin: ["https://app.cmssy.io", "https://staging.cmssy.io"],
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("injects workspace and omits auth (auth is app-owned)", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS);
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(element.props.workspace).toEqual({ id: "ws_123", slug: "pilot" });
    expect(element.props.auth).toBeUndefined();
  });

  it("calls appContext per request with the page being rendered", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const appContext = vi.fn(
      ({
        page,
        locale,
        path,
      }: {
        page: { id: string };
        locale: string;
        path: string[];
      }) => ({
        pageId: page.id,
        locale,
        activePath: "/" + path.join("/"),
      }),
    );
    const Page = createCmssyPage(CONFIG, BLOCKS, { appContext });
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(appContext).toHaveBeenCalledTimes(1);
    expect(element.props.appContext).toEqual({
      pageId: PAGE.id,
      locale: "en",
      activePath: "/about",
    });
  });

  it("accepts a plain object as appContext", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, {
      appContext: { flags: { beta: true } },
    });
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(element.props.appContext).toEqual({ flags: { beta: true } });
  });

  it("passes nothing when the app configured nothing", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS);
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(element.props.appContext).toBeUndefined();
  });

  it("degrades workspace to undefined on failure", async () => {
    fetchPage.mockResolvedValue(PAGE);
    resolveWorkspaceId.mockRejectedValue(new Error("ws boom"));
    const Page = createCmssyPage(CONFIG, BLOCKS);
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(element.props.auth).toBeUndefined();
    expect(element.props.workspace).toBeUndefined();
  });
});

describe("createCmssyPage retry policy (CMS-1446)", () => {
  beforeEach(() => {
    vi.stubEnv("CMSSY_EDITOR_ORIGIN", "");
    vi.stubEnv("NODE_ENV", "production");
    draftEnabled = false;
    fetchPage.mockReset();
    fetchPage.mockResolvedValue(PAGE);
    resolveSiteLocales.mockReset();
    resolveSiteLocales.mockResolvedValue({
      defaultLocale: "en",
      locales: ["en"],
    });
    resolveWorkspaceId.mockReset();
    resolveWorkspaceId.mockResolvedValue("ws_123");
    resolveForms.mockReset();
    resolveForms.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retries queries by default on every core call it makes", async () => {
    const Page = createCmssyPage(CONFIG, BLOCKS);
    await Page({ params: params(["about"]) });

    expect(resolveSiteLocales).toHaveBeenCalledWith(expect.anything(), {
      retry: {},
    });
    expect(resolveWorkspaceId).toHaveBeenCalledWith({ retry: {} });
    expect(fetchPage).toHaveBeenCalledWith(
      expect.anything(),
      ["about"],
      expect.objectContaining({ retry: {} }),
    );
    expect(resolveForms).toHaveBeenCalledWith(
      expect.anything(),
      PAGE.blocks,
      expect.anything(),
      "en",
      "en",
      { retry: {} },
    );
  });

  it("forwards the app's own retry policy unchanged", async () => {
    const retry = { maxRetries: 7, maxRetryAfterMs: 45_000 };
    const Page = createCmssyPage(CONFIG, BLOCKS, { retry });
    await Page({ params: params(["about"]) });

    expect(resolveSiteLocales).toHaveBeenCalledWith(expect.anything(), {
      retry,
    });
    expect(resolveWorkspaceId).toHaveBeenCalledWith({ retry });
    expect(fetchPage).toHaveBeenCalledWith(
      expect.anything(),
      ["about"],
      expect.objectContaining({ retry }),
    );
    expect(resolveForms).toHaveBeenCalledWith(
      expect.anything(),
      PAGE.blocks,
      expect.anything(),
      "en",
      "en",
      { retry },
    );
  });

  it("keeps retry: false off rather than replacing it with the default", async () => {
    const Page = createCmssyPage(CONFIG, BLOCKS, { retry: false });
    await Page({ params: params(["about"]) });

    expect(resolveSiteLocales).toHaveBeenCalledWith(expect.anything(), {
      retry: false,
    });
    expect(resolveWorkspaceId).toHaveBeenCalledWith({ retry: false });
    expect(fetchPage).toHaveBeenCalledWith(
      expect.anything(),
      ["about"],
      expect.objectContaining({ retry: false }),
    );
    expect(resolveForms).toHaveBeenCalledWith(
      expect.anything(),
      PAGE.blocks,
      expect.anything(),
      "en",
      "en",
      { retry: false },
    );
  });

  it("applies the same policy on the edit route", async () => {
    const retry = { maxRetries: 2 };
    const Page = createCmssyEditPage(CONFIG, BLOCKS, { editor: Editor, retry });
    await Page({
      params: params(["about"]),
      searchParams: searchParams({
        cmssyEdit: "1",
        cmssySecret: CONFIG.draftSecret,
      }),
    });

    expect(resolveSiteLocales).toHaveBeenCalledWith(expect.anything(), {
      retry,
    });
    expect(fetchPage).toHaveBeenCalledWith(
      expect.anything(),
      ["about"],
      expect.objectContaining({ retry }),
    );
  });
});
