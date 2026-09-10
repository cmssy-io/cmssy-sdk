import { describe, expect, it, vi } from "vitest";
import {
  CMSSY_EDIT_TOKEN_HEADER,
  fields,
  mintCmssyEditToken,
} from "@cmssy/core";
import { defineBlock } from "../registry";
import { createBlockDataHandler } from "../components/verified-block-data-handler";

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

function post(headers: Record<string, string> = {}, body: unknown = payload) {
  return new Request("https://site.invalid/api/cmssy/block-data", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const tokenFor = (page: string) =>
  mintCmssyEditToken(CONFIG.draftSecret, { page });

describe("createBlockDataHandler", () => {
  it("runs the loader for a request carrying the token minted for that page", async () => {
    ran.mockClear();
    const handle = createBlockDataHandler(CONFIG, [grid]);

    const response = await handle(
      post({ [CMSSY_EDIT_TOKEN_HEADER]: await tokenFor("/shop") }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { b1: { items: [2] } },
      errors: {},
    });
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it("refuses the header the proxy used to set, which a caller can forge", async () => {
    ran.mockClear();
    const handle = createBlockDataHandler(CONFIG, [grid]);

    const response = await handle(post({ "x-cmssy-edit": "1" }));

    expect(response.status).toBe(403);
    expect(ran).not.toHaveBeenCalled();
  });

  it("refuses a request with no token at all", async () => {
    ran.mockClear();
    const handle = createBlockDataHandler(CONFIG, [grid]);

    expect((await handle(post())).status).toBe(403);
    expect(ran).not.toHaveBeenCalled();
  });

  it("refuses a token minted for another page", async () => {
    ran.mockClear();
    const handle = createBlockDataHandler(CONFIG, [grid]);

    const response = await handle(
      post({ [CMSSY_EDIT_TOKEN_HEADER]: await tokenFor("/blog") }),
    );

    expect(response.status).toBe(403);
    expect(ran).not.toHaveBeenCalled();
  });

  it("refuses a token minted from another secret", async () => {
    ran.mockClear();
    const handle = createBlockDataHandler(CONFIG, [grid]);
    const foreign = await mintCmssyEditToken("some-other-secret-16-chars", {
      page: "/shop",
    });

    expect(
      (await handle(post({ [CMSSY_EDIT_TOKEN_HEADER]: foreign }))).status,
    ).toBe(403);
    expect(ran).not.toHaveBeenCalled();
  });

  it("answers 500 rather than running loaders when no draftSecret is configured", async () => {
    ran.mockClear();
    const { draftSecret: _unused, ...noSecret } = CONFIG;
    const handle = createBlockDataHandler(noSecret, [grid]);

    const response = await handle(
      post({ [CMSSY_EDIT_TOKEN_HEADER]: await tokenFor("/shop") }),
    );

    expect(response.status).toBe(500);
    expect(ran).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not JSON, before it looks at the token", async () => {
    ran.mockClear();
    const handle = createBlockDataHandler(CONFIG, [grid]);

    const response = await handle(
      post({ [CMSSY_EDIT_TOKEN_HEADER]: await tokenFor("/shop") }, "not json"),
    );

    expect(response.status).toBe(400);
    expect(ran).not.toHaveBeenCalled();
  });
});
