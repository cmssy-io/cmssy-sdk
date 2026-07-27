import { afterEach, describe, expect, it, vi } from "vitest";
import { CMSSY_EDIT_HEADER } from "@cmssy/core";
import { loadCmssyPage } from "../page";

const CONFIG = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
  draftSecret: "draft-secret-1234",
} as never;

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

    // The footer holds different blocks than the header. Handing it the
    // header's data is the quiet version of the bug this fixes.
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
    // One call, not one per position: a visitor pays for none of this.
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
    });
  });
});
