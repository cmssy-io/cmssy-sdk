import { describe, expect, it, vi } from "vitest";
import { defineBlock, fields } from "@cmssy/react";
import { CMSSY_EDIT_TOKEN_HEADER, mintCmssyEditToken } from "@cmssy/core";
import { createCmssyBlockDataRoute } from "../create-block-data-route";

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

const payload = {
  blocks: [{ id: "b1", type: "product-grid", content: { limit: 2 } }],
  locale: "en",
  defaultLocale: "en",
  page: { slug: "/shop", id: "p1" },
};

function post(body: unknown, token?: string) {
  return new Request("https://site.invalid/api/cmssy/block-data", {
    method: "POST",
    headers: token ? { [CMSSY_EDIT_TOKEN_HEADER]: token } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const tokenFor = (page: string) =>
  mintCmssyEditToken(CONFIG.draftSecret, { page });

describe("createCmssyBlockDataRoute", () => {
  it("resolves the loader for a request carrying the editor's token", async () => {
    ran.mockClear();
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);

    const response = await POST(post(payload, await tokenFor("/shop")));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { b1: { items: [2] } },
      errors: {},
    });
  });

  it("refuses a request with no token", async () => {
    ran.mockClear();
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);

    const response = await POST(post(payload));

    expect(response.status).toBe(403);
    expect(ran).not.toHaveBeenCalled();
  });

  it("refuses the header the proxy used to set, which a caller can forge", async () => {
    ran.mockClear();
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);
    const request = new Request("https://site.invalid/api/cmssy/block-data", {
      method: "POST",
      headers: { "x-cmssy-edit": "1" },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);

    expect(
      response.status,
      "the proxy does not cover /api/*, so this header proves nothing",
    ).toBe(403);
    expect(ran).not.toHaveBeenCalled();
  });

  it("refuses a token minted for another page", async () => {
    ran.mockClear();
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);

    const response = await POST(post(payload, await tokenFor("/pricing")));

    expect(response.status).toBe(403);
    expect(ran).not.toHaveBeenCalled();
  });

  it("refuses a token from an app with a different draftSecret", async () => {
    ran.mockClear();
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);
    const foreign = await mintCmssyEditToken("another-apps-draft-secret", {
      page: "/shop",
    });

    const response = await POST(post(payload, foreign));

    expect(response.status).toBe(403);
    expect(ran).not.toHaveBeenCalled();
  });

  it("refuses to run at all when the app has no draftSecret to verify against", async () => {
    ran.mockClear();
    const { draftSecret: _omitted, ...noSecret } = CONFIG;
    const POST = createCmssyBlockDataRoute(noSecret, [grid]);

    const response = await POST(post(payload, await tokenFor("/shop")));

    expect(response.status).toBe(500);
    expect(ran).not.toHaveBeenCalled();
  });

  it("never lets the answer be cached", async () => {
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);
    const response = await POST(post(payload, await tokenFor("/shop")));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 400 on a body that is not JSON", async () => {
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);
    const response = await POST(post("not json", await tokenFor("/shop")));
    expect(response.status).toBe(400);
  });

  it("answers 400 on a JSON body that is not a block data request", async () => {
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);
    const response = await POST(
      post(
        { blocks: "all of them", page: { slug: "/shop" } },
        await tokenFor("/shop"),
      ),
    );
    expect(response.status).toBe(400);
  });
});
