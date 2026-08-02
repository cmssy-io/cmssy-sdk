import { afterEach, describe, expect, it, vi } from "vitest";
import { fields } from "@cmssy/core";
import { defineBlock } from "../registry";
import { resolveEditorLayoutBlockData } from "../components/resolve-block-data";

const CONFIG = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "shop",
};

const headerProps = {
  brand: fields.text(),
  featured: fields.relation({ model: "product", multiple: true }),
};

const blocks = [
  defineBlock({
    type: "site-header",
    label: "Header",
    component: () => null,
    layoutPositions: ["header"],
    props: headerProps,
  }),
];

const groups = [
  {
    position: "header",
    blocks: [
      {
        id: "h1",
        type: "site-header",
        order: 0,
        isActive: true,
        content: { en: { brand: "Acme", featured: ["p1", "p2"] } },
      },
    ],
  },
];

function record(id: string, title: string) {
  return {
    id,
    modelId: "m-product",
    data: { title },
    status: "published",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function stubDelivery() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { query: string };
      calls.push(body.query);
      const data = body.query.includes("recordsByIds")
        ? {
            public: {
              model: {
                recordsByIds: [record("p1", "Pump"), record("p2", "Valve")],
              },
            },
          }
        : {
            public: {
              siteConfig: { workspaceId: "6a4366000000000000000000" },
            },
          };
      return {
        ok: true,
        status: 200,
        json: async () => ({ data }),
        text: async () => "",
      };
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("a relation field in a layout block", () => {
  it("reaches the editor as records, not as the stored ids", async () => {
    const calls = stubDelivery();

    const result = await resolveEditorLayoutBlockData({
      groups,
      blocks,
      position: "header",
      locale: "en",
      defaultLocale: "en",
      enabledLocales: ["en"],
      isPreview: true,
      config: CONFIG,
    });

    expect(calls.some((q) => q.includes("recordsByIds"))).toBe(true);

    const featured = result.content.h1?.featured as
      | Array<Record<string, unknown>>
      | undefined;
    expect(Array.isArray(featured)).toBe(true);
    expect(featured).toHaveLength(2);
    expect(featured?.[0]).toMatchObject({ id: "p1" });
    expect(featured?.[1]).toMatchObject({ id: "p2" });
    expect(result.content.h1?.brand).toBe("Acme");
  });

  it("resolves nothing when the block has no relation field", async () => {
    const calls = stubDelivery();

    await resolveEditorLayoutBlockData({
      groups: [
        {
          position: "header",
          blocks: [
            {
              id: "h1",
              type: "site-header",
              order: 0,
              isActive: true,
              content: { en: { brand: "Acme" } },
            },
          ],
        },
      ],
      blocks: [
        defineBlock({
          type: "site-header",
          label: "Header",
          component: () => null,
          layoutPositions: ["header"],
          props: { brand: fields.text() },
        }),
      ],
      position: "header",
      locale: "en",
      defaultLocale: "en",
      enabledLocales: ["en"],
      isPreview: true,
      config: CONFIG,
    });

    expect(calls.some((q) => q.includes("recordsByIds"))).toBe(false);
  });
});
