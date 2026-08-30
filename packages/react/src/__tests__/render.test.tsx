import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CmssyServerPage } from "../components/cmssy-server-page";
import { CmssyServerLayout } from "../components/cmssy-server-layout";
import { CmssyBlock } from "../components/cmssy-block";
import { renderResolvedBlock } from "../components/render-resolved-block";
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
  }: BlockProps<typeof heroProps>) => (
    <div>
      <span>{content.heading ?? ""}</span>
      <span>{String(style?.bg ?? "")}</span>
      <span>{String(advanced?.secret ?? "")}</span>
    </div>
  );
  const panelBlock = defineBlock({
    type: "panel",
    label: "Panel",
    component: Panel,
    props: heroProps,
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
    const loadedBlock = defineBlock({
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

  it("tells a block which page it is on, in the loader and in the component", async () => {
    const seen: unknown[] = [];
    const pageAware = defineBlock({
      type: "page-aware",
      props: {},
      loader: async ({ context }) => {
        seen.push(context?.page);
        return { slug: context?.page?.slug ?? "unknown" };
      },
      component: ({ context, data }) => (
        <span>
          {data?.slug}|{context?.page?.pageType ?? "unknown"}
        </span>
      ),
    });
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page: {
          id: "p",
          slug: "/blog/hello",
          pageType: "post",
          blocks: [{ id: "b1", type: "page-aware", content: {} }],
        },
        blocks: [pageAware],
        locale: "en",
      }),
    );
    expect(seen).toEqual([
      { id: "p", slug: "/blog/hello", path: ["blog", "hello"], pageType: "post" },
    ]);
    expect(html).toContain("/blog/hello|post");
  });

  it("reports no page rather than a made-up one when the page has no slug", async () => {
    const pageUnknown = defineBlock({
      type: "page-unknown",
      props: {},
      component: ({ context }) => (
        <span>{context?.page ? "knows" : "does-not-know"}</span>
      ),
    });
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page: {
          id: "p",
          blocks: [{ id: "b1", type: "page-unknown", content: {} }],
        },
        blocks: [pageUnknown],
        locale: "en",
      }),
    );
    expect(html).toContain("does-not-know");
  });

  it("hands the app's own context to blocks, untouched", async () => {
    const seen: unknown[] = [];
    const appAware = defineBlock({
      type: "app-aware",
      props: {},
      loader: async ({ context }) => {
        seen.push(context?.app);
        return { flag: (context?.app?.flags as Record<string, boolean>)?.beta };
      },
      component: ({ context, data }) => (
        <span>
          {String(data?.flag)}|{String(context?.app?.activePath)}
        </span>
      ),
    });
    const app = { flags: { beta: true }, activePath: "/pricing" };
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page: {
          id: "p",
          slug: "/pricing",
          blocks: [{ id: "b1", type: "app-aware", content: {} }],
        },
        blocks: [appAware],
        locale: "en",
        appContext: app,
      }),
    );
    expect(seen).toEqual([app]);
    expect(html).toContain("true|/pricing");
  });

  it("omits context.app when the app passes nothing", async () => {
    const appAware = defineBlock({
      type: "app-absent",
      props: {},
      component: ({ context }) => (
        <span>{context?.app ? "has-app" : "no-app"}</span>
      ),
    });
    const html = renderToStaticMarkup(
      await CmssyServerPage({
        page: {
          id: "p",
          blocks: [{ id: "b1", type: "app-absent", content: {} }],
        },
        blocks: [appAware],
        locale: "en",
      }),
    );
    expect(html).toContain("no-app");
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
              content: { en: { heading: "Hello" }, no: { heading: "Hei" } },
            },
            { id: "b2", type: "ghost", content: {} },
          ],
        },
        blocks: [heroBlock],
        locale: "no",
      }),
    );
    expect(html).toContain("Hei");
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
        region: "footer",
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
        region: "footer",
        locale: "en",
      }),
    );
    expect(html.indexOf("A")).toBeLessThan(html.indexOf("B"));
    expect(html).not.toContain("Off");
  });

  it("runs a layout block's loader and passes its result as the data prop", async () => {
    const headerBlock = defineBlock({
      type: "site-header",
      props: {},
      loader: async () => ({ msg: "from-loader" }),
      component: ({ data }) => <span>{data?.msg ?? "no-data"}</span>,
    });
    const html = renderToStaticMarkup(
      await CmssyServerLayout({
        groups: [
          {
            region: "header",
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
        region: "header",
        locale: "en",
      }),
    );
    expect(html).toContain("from-loader");
  });
});

describe("CmssyBlock resolvedContent (CMS-1025)", () => {
  it("renders from server-resolved content instead of stored content", () => {
    const html = renderToStaticMarkup(
      <CmssyBlock
        block={{
          id: "b1",
          type: "hero",
          content: { en: { heading: "Stored" } },
        }}
        locale="en"
        defaultLocale="en"
        blockMap={buildBlockMap([heroBlock])}
        resolvedContent={{ heading: "Resolved" }}
      />,
    );
    expect(html).toContain("Resolved");
    expect(html).not.toContain("Stored");
  });

  it("overlays editor patches on top of resolved content", () => {
    const html = renderToStaticMarkup(
      <CmssyBlock
        block={{ id: "b1", type: "hero", content: {} }}
        locale="en"
        defaultLocale="en"
        blockMap={buildBlockMap([heroBlock])}
        resolvedContent={{ heading: "Resolved" }}
        patchedContent={{ heading: "Patched" }}
      />,
    );
    expect(html).toContain("Patched");
  });
});

describe("resolveEditorBlockData content map (CMS-1025)", () => {
  it("returns the resolved content per block id alongside loader data", async () => {
    const { resolveEditorBlockData } =
      await import("../components/resolve-block-data");
    const result = await resolveEditorBlockData({
      page: {
        id: "p1",
        slug: "/",
        blocks: [
          { id: "b1", type: "hero", content: { en: { heading: "Hi" } } },
        ],
      } as never,
      blocks: [heroBlock],
      locale: "en",
      defaultLocale: "en",
    });
    expect(result.content.b1).toEqual({ heading: "Hi" });
    expect(result.data).toEqual({});
  });
});
