import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CmssyServerPage } from "../components/cmssy-server-page";
import { CmssyServerLayout } from "../components/cmssy-server-layout";
import { CmssyBlock } from "../components/cmssy-block";
import { renderResolvedBlock } from "../components/render-resolved-block";
import { defineBlock, buildBlockMap } from "../registry";
import { fields } from "../fields";

const Hero = ({ content }: { content: Record<string, unknown> }) => (
  <h1>{String(content.heading ?? "")}</h1>
);

const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: { heading: fields.text() },
});

describe("CmssyBlock blockMap proto-safety", () => {
  for (const evilType of ["toString", "constructor", "__proto__"]) {
    it(`treats "${evilType}" as unknown when not an own key of a plain map`, () => {
      const block = { id: "bx", type: evilType, content: {} };
      const html = renderToStaticMarkup(
        <CmssyBlock
          block={block}
          locale="en"
          defaultLocale="en"
          blockMap={{}}
        />,
      );
      expect(html).toContain(`data-cmssy-unknown-block="${evilType}"`);
      expect(html).toContain("display:none");
    });
  }

  it("resolves a real own entry in the map", () => {
    const html = renderToStaticMarkup(
      <CmssyBlock
        block={{ id: "b1", type: "hero", content: { en: { heading: "Hi" } } }}
        locale="en"
        defaultLocale="en"
        blockMap={buildBlockMap([heroBlock])}
      />,
    );
    expect(html).toContain("Hi");
  });
});

describe("CmssyBlock style/advanced field values", () => {
  const Panel = ({
    content,
    style,
    advanced,
  }: {
    content: Record<string, unknown>;
    style?: Record<string, unknown>;
    advanced?: Record<string, unknown>;
  }) => (
    <div>
      <span>{String(content.heading ?? "")}</span>
      <span>{String(style?.bg ?? "")}</span>
      <span>{String(advanced?.secret ?? "")}</span>
    </div>
  );
  const panelBlock = defineBlock({
    type: "panel",
    label: "Panel",
    component: Panel,
    props: { heading: fields.text() },
  });
  const map = buildBlockMap([panelBlock]);

  it("passes content, style and advanced as separate props (client path)", () => {
    const html = renderToStaticMarkup(
      <CmssyBlock
        block={{
          id: "b1",
          type: "panel",
          content: { en: { heading: "Hi" } },
          style: { bg: "navy" },
          advanced: { secret: "s3cr3t" },
        }}
        locale="en"
        defaultLocale="en"
        blockMap={map}
      />,
    );
    expect(html).toContain("Hi");
    expect(html).toContain("navy");
    expect(html).toContain("s3cr3t");
  });

  it("passes the buckets as separate props on the SSR path too", () => {
    const html = renderToStaticMarkup(
      renderResolvedBlock(
        {
          id: "s1",
          type: "panel",
          content: { en: { heading: "Yo" } },
          style: { bg: "teal" },
          advanced: { secret: "k3y" },
        },
        map,
        "en",
        "en",
      ),
    );
    expect(html).toContain("Yo");
    expect(html).toContain("teal");
    expect(html).toContain("k3y");
  });

  it("does not apply bucket styling to the wrapper", () => {
    const html = renderToStaticMarkup(
      <CmssyBlock
        block={{
          id: "b1",
          type: "panel",
          content: { en: { heading: "Hi" } },
          style: { bg: "navy" },
          advanced: { anchorId: "x", className: "y", customCss: "z" },
        }}
        locale="en"
        defaultLocale="en"
        blockMap={map}
      />,
    );
    expect(html).not.toContain("<style");
    expect(html).not.toContain('id="x"');
    expect(html).not.toContain('class="y"');
  });
});

describe("CmssyServerPage / CmssyServerLayout (static-map, no registry)", () => {
  it("renders blocks from the passed array without any global registration", async () => {
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page: {
          id: "p",
          blocks: [
            { id: "b1", type: "hero", content: { en: { heading: "Hi" } } },
          ],
        },
        blocks: [heroBlock],
        locale: "en",
      }),
    );
    expect(html).toContain('data-block-id="b1"');
    expect(html).toContain("Hi");
  });

  it("runs a block loader and passes its result as the data prop", async () => {
    const loadedBlock = defineBlock<Record<string, unknown>, { msg: string }>({
      type: "loaded",
      props: {},
      loader: async () => ({ msg: "from-loader" }),
      component: ({ data }) => <span>{data?.msg ?? "no-data"}</span>,
    });
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page: { id: "p", blocks: [{ id: "b1", type: "loaded", content: {} }] },
        blocks: [loadedBlock],
        locale: "en",
      }),
    );
    expect(html).toContain("from-loader");
  });

  it("passes undefined data to blocks without a loader", async () => {
    const noLoaderBlock = defineBlock({
      type: "noloader",
      props: {},
      component: ({ data }) => (
        <span>{data === undefined ? "no-data" : "has-data"}</span>
      ),
    });
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page: {
          id: "p",
          blocks: [{ id: "b1", type: "noloader", content: {} }],
        },
        blocks: [noLoaderBlock],
        locale: "en",
      }),
    );
    expect(html).toContain("no-data");
  });

  it("renders locale-resolved content and a hidden placeholder for unknown types", async () => {
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page: {
          id: "p",
          blocks: [
            {
              id: "b1",
              type: "hero",
              content: { en: { heading: "Hello" }, pl: { heading: "Cześć" } },
            },
            { id: "b2", type: "ghost", content: {} },
          ],
        },
        blocks: [heroBlock],
        locale: "pl",
      }),
    );
    expect(html).toContain("Cześć");
    expect(html).toContain('data-cmssy-unknown-block="ghost"');
    expect(html).toContain("display:none");
  });

  it("renders nothing for a null page", async () => {
    expect(
      renderToStaticMarkup(
        await CmssyServerPage({ page: null, blocks: [heroBlock] }),
      ),
    ).toBe("");
  });

  it("falls back to UnknownBlock for prototype-chain block types (no crash)", async () => {
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page: { id: "p", blocks: [{ id: "x", type: "toString", content: {} }] },
        blocks: [heroBlock],
        locale: "en",
      }),
    );
    expect(html).toContain('data-block-id="x"');
    expect(html).not.toContain("[native code]");
  });

  it("renders only active layout blocks sorted by order", async () => {
    const groups = [
      {
        position: "footer",
        blocks: [
          {
            id: "f2",
            type: "hero",
            content: { en: { heading: "B" } },
            order: 2,
            isActive: true,
          },
          {
            id: "f1",
            type: "hero",
            content: { en: { heading: "A" } },
            order: 1,
            isActive: true,
          },
          {
            id: "f3",
            type: "hero",
            content: { en: { heading: "Off" } },
            order: 3,
            isActive: false,
          },
        ],
      },
    ];
    const html = renderToStaticMarkup(
      await CmssyServerLayout({
        groups,
        blocks: [heroBlock],
        position: "footer",
        locale: "en",
      }),
    );
    expect(html.indexOf("A")).toBeLessThan(html.indexOf("B"));
    expect(html).not.toContain("Off");
  });

  it("runs a layout block's loader and passes its result as the data prop", async () => {
    const headerBlock = defineBlock<Record<string, unknown>, { msg: string }>({
      type: "site-header",
      props: {},
      loader: async () => ({ msg: "from-loader" }),
      component: ({ data }) => <span>{data?.msg ?? "no-data"}</span>,
    });
    const html = renderToStaticMarkup(
      await CmssyServerLayout({
        groups: [
          {
            position: "header",
            blocks: [
              {
                id: "h1",
                type: "site-header",
                content: {},
                order: 0,
                isActive: true,
              },
            ],
          },
        ],
        blocks: [headerBlock],
        position: "header",
        locale: "en",
      }),
    );
    expect(html).toContain("from-loader");
  });
});
