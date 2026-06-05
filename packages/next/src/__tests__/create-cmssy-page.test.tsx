import { beforeEach, describe, expect, it, vi } from "vitest";
import { CmssyServerPage, defineBlock, type CmssyPageData } from "@cmssy/react";
import { CmssyClientPage, CmssyEditablePage } from "@cmssy/react/client";

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
vi.mock("@cmssy/react", async (importActual) => {
  const actual = await importActual<typeof import("@cmssy/react")>();
  return { ...actual, fetchPage };
});

import { createCmssyPage } from "../create-cmssy-page";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  workspaceSlug: "pilot",
  draftSecret: "draft-secret-1234",
  editorOrigin: "https://app.cmssy.io",
};

const PAGE: CmssyPageData = {
  id: "page-1",
  blocks: [{ id: "b1", type: "editorial-intro", content: {} }],
};

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
  });

  it("renders the client page with published content", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG);
    const element = await Page({ params: params(["about"]) });
    expect(element.type).toBe(CmssyClientPage);
    expect(fetchPage).toHaveBeenCalledWith(
      { apiUrl: CONFIG.apiUrl, workspaceSlug: CONFIG.workspaceSlug },
      ["about"],
      { previewSecret: undefined },
    );
  });

  it("renders the RSC server page when blocks are passed", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const blocks = [
      defineBlock({
        type: "editorial-intro",
        label: "Editorial",
        component: () => null,
        props: {},
      }),
    ];
    const Page = createCmssyPage(CONFIG, blocks);
    const element = await Page({ params: params(["about"]) });
    expect(element.type).toBe(CmssyServerPage);
    expect(element.props.blocks).toBe(blocks);
  });

  it("renders the editable page with the draft secret in edit mode", async () => {
    draftEnabled = true;
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG);
    const element = await Page({ params: params([]) });
    expect(element.type).toBe(CmssyEditablePage);
    expect(element.props.edit).toEqual({
      editorOrigin: "https://app.cmssy.io",
    });
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), [], {
      previewSecret: CONFIG.draftSecret,
    });
  });

  it("enters edit mode via the cmssyEdit query flag without draft mode", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG);
    const element = await Page({
      params: params(["about"]),
      searchParams: searchParams({ cmssyEdit: "1" }),
    });
    expect(element.type).toBe(CmssyEditablePage);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: CONFIG.draftSecret,
    });
  });

  it("enters edit mode when cmssyEdit arrives as a repeated (array) param", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG);
    const element = await Page({
      params: params(["about"]),
      searchParams: searchParams({ cmssyEdit: ["1", "1"] }),
    });
    expect(element.type).toBe(CmssyEditablePage);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: CONFIG.draftSecret,
    });
  });

  it("stays published when cmssyEdit is absent", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG);
    const element = await Page({
      params: params(["about"]),
      searchParams: searchParams({}),
    });
    expect(element.type).toBe(CmssyClientPage);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
    });
  });

  it("stays published when an array cmssyEdit contains no '1'", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG);
    const element = await Page({
      params: params(["about"]),
      searchParams: searchParams({ cmssyEdit: ["0", "0"] }),
    });
    expect(element.type).toBe(CmssyClientPage);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
    });
  });

  it("calls notFound when the page is missing", async () => {
    fetchPage.mockResolvedValue(null);
    const Page = createCmssyPage(CONFIG);
    await expect(Page({ params: params(["missing"]) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("threads the resolved locale", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage({
      ...CONFIG,
      resolveLocale: () => "pl",
    });
    const element = await Page({ params: params([]) });
    expect(element.props.locale).toBe("pl");
  });

  it("rejects a wildcard editorOrigin for the bridge", () => {
    expect(() => createCmssyPage({ ...CONFIG, editorOrigin: "*" })).toThrow(
      /not allowed for the live-edit bridge/,
    );
  });

  it("resolves the root path for the index route", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG);
    await Page({ params: params(undefined) });
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), undefined, {
      previewSecret: undefined,
    });
  });

  it("renders the consumer editor in edit mode when options.editor is given", async () => {
    draftEnabled = true;
    fetchPage.mockResolvedValue(PAGE);
    const Editor = () => null;
    const Page = createCmssyPage(CONFIG, undefined, { editor: Editor });
    const element = await Page({ params: params([]) });
    expect(element.type).toBe(Editor);
    expect(element.type).not.toBe(CmssyEditablePage);
    expect(element.props.page).toBe(PAGE);
    expect(element.props.edit).toEqual({
      editorOrigin: "https://app.cmssy.io",
    });
  });

  it("ignores options.editor on the published path (uses the server page)", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Editor = () => null;
    const blocks = [
      defineBlock({
        type: "editorial-intro",
        component: () => null,
        props: {},
      }),
    ];
    const Page = createCmssyPage(CONFIG, blocks, { editor: Editor });
    const element = await Page({ params: params(["about"]) });
    expect(element.type).toBe(CmssyServerPage);
  });

  it("warns and uses the first origin for the bridge when several are configured", async () => {
    draftEnabled = true;
    fetchPage.mockResolvedValue(PAGE);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Page = createCmssyPage({
      ...CONFIG,
      editorOrigin: ["https://app.cmssy.io", "https://staging.cmssy.io"],
    });
    const element = await Page({ params: params([]) });
    expect(element.props.edit).toEqual({
      editorOrigin: "https://app.cmssy.io",
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
