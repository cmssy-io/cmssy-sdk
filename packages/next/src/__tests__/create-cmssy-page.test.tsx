import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CmssyServerPage, defineBlock, type CmssyPageData } from "@cmssy/react";
import { CmssyLocaleProvider } from "@cmssy/react/client";

/** createCmssyPage wraps its output in CmssyLocaleProvider; assert on the child. */
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
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const fetchPage = vi.hoisted(() => vi.fn());
const resolveSiteLocales = vi.hoisted(() => vi.fn());
const resolveWorkspaceId = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/react", async (importActual) => {
  const actual = await importActual<typeof import("@cmssy/react")>();
  return {
    ...actual,
    fetchPage,
    resolveSiteLocales,
    createCmssyClient: () => ({ resolveWorkspaceId }),
  };
});

const getCmssyUser = vi.hoisted(() => vi.fn());
vi.mock("../auth-server", () => ({
  getCmssyUser,
  getCmssyAccessToken: vi.fn(),
}));

import { createCmssyPage } from "../create-cmssy-page";

const AUTH_CONFIG = {
  modelSlug: "members",
  sessionSecret: "session-secret-with-enough-length-1234",
};

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
    draftEnabled = false;
    fetchPage.mockReset();
    resolveSiteLocales.mockReset();
    resolveSiteLocales.mockResolvedValue({
      defaultLocale: "en",
      locales: ["en"],
    });
    resolveWorkspaceId.mockReset();
    resolveWorkspaceId.mockResolvedValue("ws_123");
    getCmssyUser.mockReset();
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
      { previewSecret: undefined },
    );
  });

  it("renders the consumer editor with the draft secret in edit mode", async () => {
    draftEnabled = true;
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(await Page({ params: params([]) }));
    expect(element.type).toBe(Editor);
    expect(element.props.page).toBe(PAGE);
    expect(element.props.edit).toEqual({
      editorOrigin: "https://app.cmssy.io",
    });
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), [], {
      previewSecret: CONFIG.draftSecret,
    });
  });

  it("throws in edit mode when no editor is provided", async () => {
    draftEnabled = true;
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS);
    await expect(Page({ params: params([]) })).rejects.toThrow(
      /edit\/dev mode requires options\.editor/,
    );
  });

  it("enters edit mode via the cmssyEdit query flag without draft mode", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({ cmssyEdit: "1" }),
      }),
    );
    expect(element.type).toBe(Editor);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: CONFIG.draftSecret,
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
      devPreview: true,
      devToken: "cs_devtoken",
      workspaceId: "ws_123",
    });
  });

  it("enters the editor with a dev token and cmssyEdit, still sending devPreview", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(
      { ...CONFIG, devToken: "cs_devtoken" },
      BLOCKS,
      { editor: Editor },
    );
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({ cmssyEdit: "1" }),
      }),
    );
    expect(element.type).toBe(Editor);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: CONFIG.draftSecret,
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
      devPreview: undefined,
      devToken: undefined,
      workspaceId: undefined,
    });
  });

  it("enters edit mode when cmssyEdit arrives as a repeated (array) param", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = unwrap(
      await Page({
        params: params(["about"]),
        searchParams: searchParams({ cmssyEdit: ["1", "1"] }),
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

  it("rejects a wildcard editorOrigin in production when entering edit mode", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage({ ...CONFIG, editorOrigin: "*" }, BLOCKS, {
      editor: Editor,
    });
    await expect(
      Page({
        params: params(["about"]),
        searchParams: searchParams({ cmssyEdit: "1" }),
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
    });
  });

  it("warns and uses the first origin for the bridge when several are configured", async () => {
    draftEnabled = true;
    fetchPage.mockResolvedValue(PAGE);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Page = createCmssyPage(
      {
        ...CONFIG,
        editorOrigin: ["https://app.cmssy.io", "https://staging.cmssy.io"],
      },
      BLOCKS,
      { editor: Editor },
    );
    const element = unwrap(await Page({ params: params([]) }));
    expect(element.props.edit).toEqual({
      editorOrigin: "https://app.cmssy.io",
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("injects workspace and omits auth when auth is not configured", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS);
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(element.props.workspace).toEqual({ id: "ws_123", slug: "pilot" });
    expect(element.props.auth).toBeUndefined();
    expect(getCmssyUser).not.toHaveBeenCalled();
  });

  it("injects authenticated member when auth is configured", async () => {
    fetchPage.mockResolvedValue(PAGE);
    getCmssyUser.mockResolvedValue({ recordId: "rec_1", email: "a@b.com" });
    const Page = createCmssyPage({ ...CONFIG, auth: AUTH_CONFIG }, BLOCKS);
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(element.props.auth).toEqual({
      isAuthenticated: true,
      member: { recordId: "rec_1", email: "a@b.com" },
    });
  });

  it("reports unauthenticated with a null member when no session", async () => {
    fetchPage.mockResolvedValue(PAGE);
    getCmssyUser.mockResolvedValue(null);
    const Page = createCmssyPage({ ...CONFIG, auth: AUTH_CONFIG }, BLOCKS);
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(element.props.auth).toEqual({
      isAuthenticated: false,
      member: null,
    });
  });

  it("degrades auth and workspace to undefined on failure", async () => {
    fetchPage.mockResolvedValue(PAGE);
    getCmssyUser.mockRejectedValue(new Error("auth boom"));
    resolveWorkspaceId.mockRejectedValue(new Error("ws boom"));
    const Page = createCmssyPage({ ...CONFIG, auth: AUTH_CONFIG }, BLOCKS);
    const element = unwrap(await Page({ params: params(["about"]) }));
    expect(element.props.auth).toBeUndefined();
    expect(element.props.workspace).toBeUndefined();
  });
});
