import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CmssyServerPage } from "../components/cmssy-server-page";
import { CmssyServerLayout } from "../components/cmssy-server-layout";
import { CmssyBlock } from "../components/cmssy-block";
import { resolveBlockData } from "../components/resolve-block-data";
import { markBlockError, readBlockError } from "../components/block-error";
import { defineBlock, buildBlockMap, type BlockProps } from "../registry";
import { fields } from "@cmssy/core";

const heroProps = { heading: fields.text() };

const Hero = ({ content }: BlockProps<typeof heroProps>) => (
  <h1>{content.heading ?? ""}</h1>
);

const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: heroProps,
});

const brokenBlock = defineBlock({
  type: "broken",
  props: {},
  loader: async () => {
    throw new Error("API 429");
  },
  component: () => <span>loaded</span>,
});

const page = {
  id: "p",
  blocks: [
    { id: "b-broken", type: "broken", content: {} },
    { id: "b-hero", type: "hero", content: { en: { heading: "Hi" } } },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loader failures", () => {
  it("renders an error card in edit mode and keeps sibling blocks", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page,
        blocks: [brokenBlock, heroBlock],
        locale: "en",
        editMode: true,
      }),
    );
    expect(html).toContain('data-cmssy-block-error="loader"');
    expect(html).toContain("broken");
    expect(html).toContain("b-broken");
    expect(html).toContain("API 429");
    expect(html).toContain("loader failed");
    expect(html).toContain("Hi");
    expect(html).not.toContain("loaded");
  });

  it("skips the block in production, keeps the page and logs console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page,
        blocks: [brokenBlock, heroBlock],
        locale: "en",
      }),
    );
    expect(html).not.toContain("data-cmssy-block-error");
    expect(html).not.toContain("b-broken");
    expect(html).not.toContain("API 429");
    expect(html).toContain("Hi");
    expect(errorSpy).toHaveBeenCalledWith(
      '[cmssy] loader for block "broken" (b-broken) failed',
      expect.any(Error),
    );
  });

  it("renders the card for a failing layout block in edit mode (shared path)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(
      await CmssyServerLayout({
        groups: [
          {
            position: "header",
            blocks: [
              {
                id: "h1",
                type: "broken",
                content: {},
                order: 0,
                isActive: true,
              },
            ],
          },
        ],
        blocks: [brokenBlock],
        position: "header",
        locale: "en",
        editMode: true,
      }),
    );
    expect(html).toContain('data-cmssy-block-error="loader"');
    expect(html).toContain("API 429");
  });
});

describe("unregistered block types", () => {
  it("renders a card naming the type in edit mode", async () => {
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page: {
          id: "p",
          blocks: [{ id: "b-ghost", type: "ghost", content: {} }],
        },
        blocks: [heroBlock],
        locale: "en",
        editMode: true,
      }),
    );
    expect(html).toContain('data-cmssy-block-error="unregistered"');
    expect(html).toContain("type not registered");
    expect(html).toContain("ghost");
    expect(html).toContain("b-ghost");
  });

  it("keeps the hidden placeholder and no card in production", async () => {
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page: {
          id: "p",
          blocks: [{ id: "b-ghost", type: "ghost", content: {} }],
        },
        blocks: [heroBlock],
        locale: "en",
      }),
    );
    expect(html).not.toContain("data-cmssy-block-error");
    expect(html).toContain('data-cmssy-unknown-block="ghost"');
    expect(html).toContain("display:none");
  });

  it("renders a card on the editor path (CmssyBlock)", () => {
    const html = renderToStaticMarkup(
      <CmssyBlock
        block={{ id: "b-ghost", type: "ghost", content: {} }}
        locale="en"
        defaultLocale="en"
        blockMap={{}}
        editMode
      />,
    );
    expect(html).toContain('data-cmssy-block-error="unregistered"');
    expect(html).toContain("ghost");
  });
});

describe("resolveBlockData error markers", () => {
  it("marks a failed loader in preview so the editor can render the card", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const data = await resolveBlockData({
      page,
      blocks: [brokenBlock, heroBlock],
      locale: "en",
      defaultLocale: "en",
      isPreview: true,
    });
    expect(readBlockError(data["b-broken"])).toEqual({
      source: "loader",
      message: "API 429",
    });
  });

  it("omits the failed block outside preview", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const data = await resolveBlockData({
      page,
      blocks: [brokenBlock, heroBlock],
      locale: "en",
      defaultLocale: "en",
    });
    expect(data).not.toHaveProperty("b-broken");
  });

  it("CmssyBlock renders the card from a marker and skips the component", () => {
    const html = renderToStaticMarkup(
      <CmssyBlock
        block={{ id: "b-broken", type: "broken", content: {} }}
        locale="en"
        defaultLocale="en"
        blockMap={buildBlockMap([brokenBlock])}
        editMode
        data={markBlockError({ source: "loader", message: "API 429" })}
      />,
    );
    expect(html).toContain('data-cmssy-block-error="loader"');
    expect(html).toContain("API 429");
    expect(html).not.toContain("loaded");
  });

  it("CmssyBlock skips a marked block entirely outside edit mode", () => {
    const html = renderToStaticMarkup(
      <CmssyBlock
        block={{ id: "b-broken", type: "broken", content: {} }}
        locale="en"
        defaultLocale="en"
        blockMap={buildBlockMap([brokenBlock])}
        data={markBlockError({ source: "loader", message: "API 429" })}
      />,
    );
    expect(html).toBe("");
  });
});
