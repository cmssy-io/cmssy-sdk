import { describe, it, expect, vi } from "vitest";
import { defineBlock, fields } from "../index";
import {
  parseBlockDataRequest,
  resolveBlockDataRequest,
} from "../components/block-data-request";

function grid(loader: (args: { content: Record<string, unknown> }) => unknown) {
  return defineBlock({
    type: "product-grid",
    label: "Product grid",
    component: () => null,
    props: {
      heading: fields.text({ label: "Heading" }),
      limit: fields.number({ label: "Limit" }),
    },
    loader: async ({ content }) => loader({ content }),
  });
}

const plain = defineBlock({
  type: "prose",
  label: "Prose",
  component: () => null,
  props: { body: fields.text({ label: "Body" }) },
});

const request = {
  blocks: [{ id: "b1", type: "product-grid", content: { limit: 3 } }],
  locale: "en",
  defaultLocale: "en",
};

describe("resolveBlockDataRequest", () => {
  it("runs the loader with the content the editor is showing, not the saved one", async () => {
    const seen: Record<string, unknown>[] = [];
    const result = await resolveBlockDataRequest(
      parseBlockDataRequest(request),
      {
        blocks: [
          grid(({ content }) => {
            seen.push(content);
            return { items: [content.limit] };
          }),
        ],
      },
    );

    expect(
      seen[0]?.limit,
      "the whole point is that unsaved content reaches the loader",
    ).toBe(3);
    expect(result.data.b1).toEqual({ items: [3] });
    expect(result.errors).toEqual({});
  });

  it("answers for the blocks that have a loader and stays silent about the rest", async () => {
    const result = await resolveBlockDataRequest(
      parseBlockDataRequest({
        ...request,
        blocks: [
          ...request.blocks,
          { id: "b2", type: "prose", content: { body: "hi" } },
        ],
      }),
      { blocks: [grid(() => ({ items: [] })), plain] },
    );

    expect(Object.keys(result.data)).toEqual(["b1"]);
  });

  it("reports a throwing loader per block instead of failing the whole request", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await resolveBlockDataRequest(
      parseBlockDataRequest(request),
      {
        blocks: [
          grid(() => {
            throw new Error("catalog is down");
          }),
        ],
      },
    );
    spy.mockRestore();

    expect(result.data.b1).toBeUndefined();
    expect(result.errors.b1?.source).toBe("loader");
    expect(result.errors.b1?.message).toContain("catalog is down");
  });

  it("does nothing for a block type this app does not register", async () => {
    const result = await resolveBlockDataRequest(
      parseBlockDataRequest({
        ...request,
        blocks: [{ id: "b9", type: "not-mine", content: {} }],
      }),
      { blocks: [grid(() => ({ items: ["leaked"] }))] },
    );

    expect(result.data).toEqual({});
  });
});

describe("parseBlockDataRequest", () => {
  it.each([
    ["a missing locale", { ...request, locale: "" }],
    ["a missing defaultLocale", { ...request, defaultLocale: undefined }],
    ["no blocks array", { locale: "en", defaultLocale: "en" }],
    [
      "a block with no type",
      { ...request, blocks: [{ id: "b1", content: {} }] },
    ],
    [
      "a block with no content object",
      { ...request, blocks: [{ id: "b1", type: "x", content: "nope" }] },
    ],
  ])("rejects %s", (_label, body) => {
    expect(() => parseBlockDataRequest(body)).toThrow();
  });

  it("refuses a request that carries more blocks than a page can hold", () => {
    const blocks = Array.from({ length: 51 }, (_, i) => ({
      id: `b${i}`,
      type: "product-grid",
      content: {},
    }));
    expect(() => parseBlockDataRequest({ ...request, blocks })).toThrow(
      /more than 50/,
    );
  });
});
