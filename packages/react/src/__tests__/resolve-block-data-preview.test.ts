import { describe, expect, it, vi } from "vitest";
import { fields } from "@cmssy/core";
import { defineBlock } from "../registry";
import {
  resolveEditorBlockData,
  resolveEditorLayoutBlockData,
} from "../components/resolve-block-data";

const resolveRelationContent = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => {}),
);
vi.mock("@cmssy/core/internal", async (importActual) => {
  const actual = await importActual<typeof import("@cmssy/core/internal")>();
  return { ...actual, resolveRelationContent };
});

const featured = defineBlock({
  type: "featured",
  label: "Featured",
  component: () => null,
  props: { pick: fields.relation({ model: "product", multiple: true }) },
});

const CONFIG = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
};
const BLOCK = { id: "b1", type: "featured", content: { pick: ["p1"] } };

describe("relation reads behind a preview (CMS-2145)", () => {
  it("hands the preview secret to the relation read of a page's blocks", async () => {
    await resolveEditorBlockData({
      page: { id: "p", blocks: [BLOCK] },
      blocks: [featured],
      locale: "en",
      defaultLocale: "en",
      isPreview: true,
      config: CONFIG,
      previewSecret: "draft-1",
    });

    expect(
      resolveRelationContent.mock.calls.at(-1)?.[5],
      "A block picking a product not yet published must show it in the editor preview; without the secret the API drops it.",
    ).toBe("draft-1");
  });

  it("hands it to the relation read of a layout region too", async () => {
    await resolveEditorLayoutBlockData({
      groups: [
        {
          region: "header",
          blocks: [{ ...BLOCK, order: 0, isActive: true }],
        },
      ] as never,
      blocks: [featured],
      region: "header",
      locale: "en",
      defaultLocale: "en",
      isPreview: true,
      config: CONFIG,
      previewSecret: "draft-1",
    });

    expect(resolveRelationContent.mock.calls.at(-1)?.[5]).toBe("draft-1");
  });
});
