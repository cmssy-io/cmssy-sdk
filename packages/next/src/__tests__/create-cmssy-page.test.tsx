import { beforeEach, describe, expect, it, vi } from "vitest";
import { CmssyPage, type CmssyPageData } from "@cmssy/react";
import { CmssyEditablePage } from "@cmssy/react/client";

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

describe("createCmssyPage", () => {
  beforeEach(() => {
    draftEnabled = false;
    fetchPage.mockReset();
  });

  it("renders CmssyPage with published content", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG);
    const element = await Page({ params: params(["about"]) });
    expect(element.type).toBe(CmssyPage);
    expect(fetchPage).toHaveBeenCalledWith(
      { apiUrl: CONFIG.apiUrl, workspaceSlug: CONFIG.workspaceSlug },
      ["about"],
      { previewSecret: undefined },
    );
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

  it("resolves the root path for the index route", async () => {
    fetchPage.mockResolvedValue(PAGE);
    const Page = createCmssyPage(CONFIG);
    await Page({ params: params(undefined) });
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), undefined, {
      previewSecret: undefined,
    });
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
