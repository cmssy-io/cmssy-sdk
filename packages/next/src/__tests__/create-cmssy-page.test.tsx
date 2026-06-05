import { beforeEach, describe, expect, it, vi } from "vitest";
import { CmssyServerPage, defineBlock, type CmssyPageData } from "@cmssy/react";

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
  });

  it("renders the RSC server page with the passed blocks for published content", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS);
    const element = await Page({ params: params(["about"]) });
    expect(element.type).toBe(CmssyServerPage);
    expect(element.props.blocks).toBe(BLOCKS);
    expect(fetchPage).toHaveBeenCalledWith(
      { apiUrl: CONFIG.apiUrl, workspaceSlug: CONFIG.workspaceSlug },
      ["about"],
      { previewSecret: undefined },
    );
  });

  it("renders the consumer editor with the draft secret in edit mode", async () => {
    draftEnabled = true;
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = await Page({ params: params([]) });
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
      /edit mode requires options\.editor/,
    );
  });

  it("enters edit mode via the cmssyEdit query flag without draft mode", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = await Page({
      params: params(["about"]),
      searchParams: searchParams({ cmssyEdit: "1" }),
    });
    expect(element.type).toBe(Editor);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: CONFIG.draftSecret,
    });
  });

  it("enters edit mode when cmssyEdit arrives as a repeated (array) param", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = await Page({
      params: params(["about"]),
      searchParams: searchParams({ cmssyEdit: ["1", "1"] }),
    });
    expect(element.type).toBe(Editor);
  });

  it("stays published when cmssyEdit is absent", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = await Page({
      params: params(["about"]),
      searchParams: searchParams({}),
    });
    expect(element.type).toBe(CmssyServerPage);
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), ["about"], {
      previewSecret: undefined,
    });
  });

  it("stays published when an array cmssyEdit contains no '1'", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG, BLOCKS, { editor: Editor });
    const element = await Page({
      params: params(["about"]),
      searchParams: searchParams({ cmssyEdit: ["0", "0"] }),
    });
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
    const element = await Page({ params: params([]) });
    expect(element.props.locale).toBe("pl");
  });

  it("rejects a wildcard editorOrigin for the bridge", () => {
    expect(() =>
      createCmssyPage({ ...CONFIG, editorOrigin: "*" }, BLOCKS),
    ).toThrow(/not allowed for the live-edit bridge/);
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
    const element = await Page({ params: params([]) });
    expect(element.props.edit).toEqual({
      editorOrigin: "https://app.cmssy.io",
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
