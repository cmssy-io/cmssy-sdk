import { describe, expect, it, vi } from "vitest";
import { CMSSY_EDIT_TOKEN_HEADER, mintCmssyEditToken } from "@cmssy/core";
import { defineBlock, fields } from "@cmssy/react";
import { createCmssyBlockDataAction } from "../block-data-action";

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

function args(headers: Record<string, string> = {}) {
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

describe("createCmssyBlockDataAction", () => {
  it("takes the route action args and runs the loader for the editor's token", async () => {
    ran.mockClear();
    const action = createCmssyBlockDataAction(CONFIG, [grid]);
    const token = await mintCmssyEditToken(CONFIG.draftSecret, {
      page: "/shop",
    });

    const response = await action(args({ [CMSSY_EDIT_TOKEN_HEADER]: token }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { b1: { items: [2] } },
      errors: {},
    });
  });

  it("refuses a forged edit header", async () => {
    ran.mockClear();
    const action = createCmssyBlockDataAction(CONFIG, [grid]);

    expect((await action(args({ "x-cmssy-edit": "1" }))).status).toBe(403);
    expect(ran).not.toHaveBeenCalled();
  });
});
