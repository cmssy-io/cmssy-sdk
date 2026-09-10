import { describe, expect, it, vi } from "vitest";
import { CMSSY_EDIT_TOKEN_HEADER, mintCmssyEditToken } from "@cmssy/core";
import { defineBlock, fields } from "@cmssy/react";
import { createCmssyBlockDataEndpoint } from "../block-data-endpoint";

const ran = vi.fn();

const grid = defineBlock({
  type: "product-grid",
  label: "Product grid",
  component: () => null,
  props: { limit: fields.number({ label: "Limit" }) },
  loader: async ({ content }: { content: Record<string, unknown> }) => {
    ran(content);
    return { items: [content.limit] };
  },
});

const CONFIG = {
  apiUrl: "https://api.example.invalid/graphql",
  org: "acme",
  workspaceSlug: "site",
  draftSecret: "draft-secret-at-least-16-chars",
};

function context(headers: Record<string, string> = {}) {
  return {
    request: new Request("https://site.invalid/api/cmssy/block-data", {
      method: "POST",
      headers,
      body: JSON.stringify({
        blocks: [{ id: "b1", type: "product-grid", content: { limit: 2 } }],
        locale: "en",
        defaultLocale: "en",
        page: { slug: "/shop" },
      }),
    }),
  };
}

describe("createCmssyBlockDataEndpoint", () => {
  it("takes the Astro context and runs the loader for the editor's token", async () => {
    ran.mockClear();
    const POST = createCmssyBlockDataEndpoint(CONFIG, [grid]);
    const token = await mintCmssyEditToken(CONFIG.draftSecret, {
      page: "/shop",
    });

    const response = await POST(context({ [CMSSY_EDIT_TOKEN_HEADER]: token }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { b1: { items: [2] } },
      errors: {},
    });
  });

  it("refuses a forged edit header", async () => {
    ran.mockClear();
    const POST = createCmssyBlockDataEndpoint(CONFIG, [grid]);

    expect((await POST(context({ "x-cmssy-edit": "1" }))).status).toBe(403);
    expect(ran).not.toHaveBeenCalled();
  });
});
