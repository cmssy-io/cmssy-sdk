import { describe, expect, it, vi } from "vitest";

const { headerStore } = vi.hoisted(() => ({
  headerStore: { value: null as string | null },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === "x-cmssy-edit" ? headerStore.value : null),
  })),
}));

import { defineBlock, fields } from "@cmssy/react";
import { createCmssyBlockDataRoute } from "../create-block-data-route";

const ran = vi.fn();

const grid = defineBlock({
  type: "product-grid",
  label: "Product grid",
  component: () => null,
  props: { limit: fields.number({ label: "Limit" }) },
  loader: async ({ content }) => {
    ran(content);
    return { items: [content.limit] };
  },
});

const CONFIG = {
  apiUrl: "https://api.example.invalid/graphql",
  org: "acme",
  workspaceSlug: "site",
};

function post(body: unknown) {
  return new Request("https://site.invalid/api/cmssy/block-data", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const payload = {
  blocks: [{ id: "b1", type: "product-grid", content: { limit: 2 } }],
  locale: "en",
  defaultLocale: "en",
};

describe("createCmssyBlockDataRoute", () => {
  it("refuses a request that is not a verified editor request", async () => {
    headerStore.value = null;
    ran.mockClear();
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);

    const response = await POST(post(payload));

    expect(response.status).toBe(403);
    expect(
      ran,
      "an open endpoint would run this app's loaders for anyone who asks",
    ).not.toHaveBeenCalled();
  });

  it("resolves the loader for an editor request", async () => {
    headerStore.value = "1";
    ran.mockClear();
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);

    const response = await POST(post(payload));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { b1: { items: [2] } },
      errors: {},
    });
  });

  it("never lets the answer be cached", async () => {
    headerStore.value = "1";
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);

    const response = await POST(post(payload));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 400 on a body that is not JSON", async () => {
    headerStore.value = "1";
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);

    const response = await POST(post("not json"));

    expect(response.status).toBe(400);
  });

  it("answers 400 on a JSON body that is not a block data request", async () => {
    headerStore.value = "1";
    const POST = createCmssyBlockDataRoute(CONFIG, [grid]);

    const response = await POST(post({ blocks: "all of them" }));

    expect(response.status).toBe(400);
  });
});
