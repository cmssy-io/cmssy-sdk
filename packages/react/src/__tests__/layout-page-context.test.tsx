import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CmssyBlockContext } from "@cmssy/core";
import { CmssyServerLayout } from "../components/cmssy-server-layout";
import { resolveEditorLayoutBlockData } from "../components/resolve-block-data";
import { defineBlock } from "../registry";

const seen = vi.hoisted(() => vi.fn());

const Sidebar = ({ data }: { data?: unknown }) => (
  <nav>{JSON.stringify(data ?? null)}</nav>
);

const blocks = [
  defineBlock({
    type: "docs-sidebar",
    label: "Docs sidebar",
    component: Sidebar,
    layoutRegions: ["sidebar_left"],
    props: {},
    loader: async ({ context }: { context?: CmssyBlockContext }) => {
      seen(context?.page);
      return {
        slug: context?.page?.slug ?? null,
        path: context?.page?.path ?? null,
      };
    },
  }),
];

const groups = [
  {
    region: "sidebar_left",
    blocks: [
      {
        id: "s1",
        type: "docs-sidebar",
        content: { en: {} },
        order: 0,
        isActive: true,
      },
    ],
  },
];

const shared = {
  groups,
  blocks,
  region: "sidebar_left",
  locale: "en",
  defaultLocale: "en",
  enabledLocales: ["en"],
};

afterEach(() => vi.clearAllMocks());

describe("a layout block's loader sees the routed page (CMS-1708)", () => {
  it("in the editor resolution: slug and path from the slot, no id when nothing fetched it", async () => {
    const result = await resolveEditorLayoutBlockData({
      ...shared,
      page: { slug: "/docs/blocks" },
      isPreview: true,
    });

    expect(result.data.s1).toStrictEqual({
      slug: "/docs/blocks",
      path: ["docs", "blocks"],
    });
    const context = seen.mock.calls[0]?.[0];
    expect(context).toStrictEqual({
      slug: "/docs/blocks",
      path: ["docs", "blocks"],
      pageType: null,
    });
    expect(context).not.toHaveProperty("id");
  });

  it("runs the loaders as a preview when the layout is a draft the visitor asked for", async () => {
    const previews = vi.fn();
    const html = renderToStaticMarkup(
      await CmssyServerLayout({
        ...shared,
        blocks: [
          defineBlock({
            type: "docs-sidebar",
            label: "Docs sidebar",
            component: Sidebar,
            layoutRegions: ["sidebar_left"],
            props: {},
            loader: async ({ context }: { context?: CmssyBlockContext }) => {
              previews(context?.isPreview);
              return context?.isPreview ?? null;
            },
          }),
        ],
        page: { slug: "/docs" },
        preview: true,
      }),
    );

    expect(previews).toHaveBeenCalledWith(true);
    expect(html).toContain("<nav>true</nav>");
  });

  it("in the public render: the page prop reaches the loader and the component", async () => {
    const html = renderToStaticMarkup(
      await CmssyServerLayout({ ...shared, page: { slug: "/docs" } }),
    );

    expect(html).toContain(
      "<nav>{&quot;slug&quot;:&quot;/docs&quot;,&quot;path&quot;:[&quot;docs&quot;]}</nav>",
    );
  });

  it("keeps the fetched id when the caller had the page already", async () => {
    await resolveEditorLayoutBlockData({
      ...shared,
      page: { id: "page_1", slug: "/docs", pageType: "docs" },
    });

    expect(seen).toHaveBeenCalledWith({
      id: "page_1",
      slug: "/docs",
      path: ["docs"],
      pageType: "docs",
    });
  });

  it("leaves context.page undefined, not a crash, when no page is known", async () => {
    const result = await resolveEditorLayoutBlockData(shared);

    expect(seen).toHaveBeenCalledWith(undefined);
    expect(result.data.s1).toStrictEqual({ slug: null, path: null });
  });
});
