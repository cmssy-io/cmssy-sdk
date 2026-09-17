import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fields } from "@cmssy/core";
import { CmssyBlocks } from "../components/cmssy-blocks";
import { CmssyLayoutRegion } from "../components/cmssy-layout-region";
import { defineBlock, type BlockProps } from "../registry";

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

const navProps = { label: fields.text() };
const Nav = ({ content, data }: BlockProps<typeof navProps>) => (
  <nav>
    {content.label ?? ""}
    {typeof data === "string" ? data : ""}
  </nav>
);
const navBlock = defineBlock({
  type: "nav",
  label: "Nav",
  component: Nav,
  props: navProps,
});

const blocks = [heroBlock, navBlock];

function page(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    slug: "/",
    blocks: [{ id: "b1", type: "hero", content: { en: { heading: "Hi" } } }],
    ...overrides,
  };
}

function layoutGroups() {
  return [
    {
      region: "header",
      blocks: [
        {
          id: "l2",
          type: "nav",
          order: 1,
          isActive: true,
          content: { en: { label: "second" } },
        },
        {
          id: "l1",
          type: "nav",
          order: 0,
          isActive: true,
          content: { en: { label: "first" } },
        },
        {
          id: "l3",
          type: "nav",
          order: 2,
          isActive: false,
          content: { en: { label: "hidden" } },
        },
      ],
    },
  ];
}

describe("CmssyBlocks (CMS-1874)", () => {
  it("renders a page's blocks synchronously, without awaiting anything", () => {
    const html = renderToStaticMarkup(
      <CmssyBlocks
        page={page()}
        blocks={blocks}
        locale="en"
        defaultLocale="en"
      />,
    );

    expect(html).toContain("<h1>Hi</h1>");
    expect(html).toContain('data-block-id="b1"');
  });

  it("prefers the content and data a loader already resolved", () => {
    const html = renderToStaticMarkup(
      <CmssyBlocks
        page={{
          id: "p1",
          slug: "/",
          blocks: [
            { id: "b1", type: "nav", content: { en: { label: "raw" } } },
          ],
        }}
        blocks={blocks}
        locale="en"
        defaultLocale="en"
        blockContent={{ b1: { label: "resolved" } }}
        blockData={{ b1: " + loaded" }}
      />,
    );

    expect(html).toContain("resolved + loaded");
    expect(html).not.toContain("raw");
  });

  it("renders nothing for a page that does not exist", () => {
    expect(
      renderToStaticMarkup(
        <CmssyBlocks
          page={null}
          blocks={blocks}
          locale="en"
          defaultLocale="en"
        />,
      ),
    ).toBe("");
  });

  it("falls back to the default locale for a missing translation", () => {
    const html = renderToStaticMarkup(
      <CmssyBlocks
        page={page()}
        blocks={blocks}
        locale="pl"
        defaultLocale="en"
        enabledLocales={["en", "pl"]}
      />,
    );

    expect(html).toContain("<h1>Hi</h1>");
  });
});

describe("CmssyLayoutRegion (CMS-1874)", () => {
  it("renders one region in order, skipping the blocks it disabled", () => {
    const html = renderToStaticMarkup(
      <CmssyLayoutRegion
        groups={layoutGroups()}
        region="header"
        blocks={blocks}
        locale="en"
        defaultLocale="en"
      />,
    );

    expect(html.indexOf("first")).toBeLessThan(html.indexOf("second"));
    expect(html).not.toContain("hidden");
    expect(html).toContain('data-layout-region="header"');
  });

  it("renders nothing for a region the site does not fill", () => {
    expect(
      renderToStaticMarkup(
        <CmssyLayoutRegion
          groups={layoutGroups()}
          region="footer"
          blocks={blocks}
          locale="en"
          defaultLocale="en"
        />,
      ),
    ).toBe("");
  });
});
