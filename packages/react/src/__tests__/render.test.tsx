import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CmssyServerPage } from "../components/cmssy-server-page";
import { CmssyServerLayout } from "../components/cmssy-server-layout";
import { CmssyBlock } from "../components/cmssy-block";
import { defineBlock, buildBlockMap } from "../registry";
import { fields } from "../fields";

const Hero = ({ content }: { content: Record<string, unknown> }) => (
  <h1>{String(content.heading ?? "")}</h1>
);

const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: { heading: fields.singleLine() },
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

describe("CmssyServerPage / CmssyServerLayout (static-map, no registry)", () => {
  it("renders blocks from the passed array without any global registration", () => {
    const html = renderToStaticMarkup(
      <CmssyServerPage
        page={{
          id: "p",
          blocks: [
            { id: "b1", type: "hero", content: { en: { heading: "Hi" } } },
          ],
        }}
        blocks={[heroBlock]}
        locale="en"
      />,
    );
    expect(html).toContain('data-block-id="b1"');
    expect(html).toContain("Hi");
  });

  it("renders locale-resolved content and a hidden placeholder for unknown types", () => {
    const html = renderToStaticMarkup(
      <CmssyServerPage
        page={{
          id: "p",
          blocks: [
            {
              id: "b1",
              type: "hero",
              content: { en: { heading: "Hello" }, pl: { heading: "Cześć" } },
            },
            { id: "b2", type: "ghost", content: {} },
          ],
        }}
        blocks={[heroBlock]}
        locale="pl"
      />,
    );
    expect(html).toContain("Cześć");
    expect(html).toContain('data-cmssy-unknown-block="ghost"');
    expect(html).toContain("display:none");
  });

  it("renders nothing for a null page", () => {
    expect(
      renderToStaticMarkup(
        <CmssyServerPage page={null} blocks={[heroBlock]} />,
      ),
    ).toBe("");
  });

  it("falls back to UnknownBlock for prototype-chain block types (no crash)", () => {
    const html = renderToStaticMarkup(
      <CmssyServerPage
        page={{ id: "p", blocks: [{ id: "x", type: "toString", content: {} }] }}
        blocks={[heroBlock]}
        locale="en"
      />,
    );
    expect(html).toContain('data-block-id="x"');
    expect(html).not.toContain("[native code]");
  });

  it("renders only active layout blocks sorted by order", () => {
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
      <CmssyServerLayout
        groups={groups}
        blocks={[heroBlock]}
        position="footer"
        locale="en"
      />,
    );
    expect(html.indexOf("A")).toBeLessThan(html.indexOf("B"));
    expect(html).not.toContain("Off");
  });
});
