import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CmssyPage } from "../components/cmssy-page";
import { CmssyClientPage } from "../components/cmssy-client-page";
import { CmssyLayout } from "../components/cmssy-layout";
import { CmssyServerPage } from "../components/cmssy-server-page";
import { CmssyServerLayout } from "../components/cmssy-server-layout";
import { CmssyBlock } from "../components/cmssy-block";
import {
  registerComponent,
  clearRegistry,
  defineBlock,
  blocksToSchemas,
  blocksToMeta,
  buildBlockMap,
} from "../registry";
import { fields } from "../fields";

const Hero = ({ content }: { content: Record<string, unknown> }) => (
  <h1>{String(content.heading ?? "")}</h1>
);

describe("CmssyPage", () => {
  beforeEach(() => clearRegistry());

  it("renders registered components with locale-resolved content", () => {
    registerComponent(Hero, {
      type: "hero",
      props: { heading: fields.singleLine() },
    });
    const page = {
      id: "p",
      blocks: [
        {
          id: "b1",
          type: "hero",
          content: { en: { heading: "Hello" }, pl: { heading: "Cześć" } },
        },
      ],
    };
    const html = renderToStaticMarkup(<CmssyPage page={page} locale="pl" />);
    expect(html).toContain("Cześć");
    expect(html).toContain('data-block-id="b1"');
    expect(html).toContain('data-block-type="hero"');
  });

  it("renders a hidden placeholder for an unregistered block type", () => {
    const page = {
      id: "p",
      blocks: [{ id: "b2", type: "ghost", content: {} }],
    };
    const html = renderToStaticMarkup(<CmssyPage page={page} />);
    expect(html).toContain('data-cmssy-unknown-block="ghost"');
    expect(html).toContain('data-block-id="b2"');
    expect(html).toContain("display:none");
  });

  it("renders nothing for a null page", () => {
    expect(renderToStaticMarkup(<CmssyPage page={null} />)).toBe("");
  });
});

describe("CmssyBlock blockMap proto-safety", () => {
  // A consumer may pass a plain-object blockMap; a CMS-supplied type like
  // "toString"/"__proto__" must not resolve to a prototype member.
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

  it("still resolves a real own entry in the map", () => {
    const html = renderToStaticMarkup(
      <CmssyBlock
        block={{ id: "b1", type: "hero", content: { en: { heading: "Hi" } } }}
        locale="en"
        defaultLocale="en"
        blockMap={buildBlockMap([
          defineBlock({
            type: "hero",
            component: Hero,
            props: { heading: fields.singleLine() },
          }),
        ])}
      />,
    );
    expect(html).toContain("Hi");
  });
});

describe("CmssyClientPage", () => {
  beforeEach(() => clearRegistry());

  it("SSRs registered blocks (client boundary keeps hooks working)", () => {
    registerComponent(Hero, {
      type: "hero",
      props: { heading: fields.singleLine() },
    });
    const page = {
      id: "p",
      blocks: [{ id: "b1", type: "hero", content: { en: { heading: "Hi" } } }],
    };
    const html = renderToStaticMarkup(<CmssyClientPage page={page} />);
    expect(html).toContain("Hi");
    expect(html).toContain('data-block-id="b1"');
  });

  it("renders nothing for a null page", () => {
    expect(renderToStaticMarkup(<CmssyClientPage page={null} />)).toBe("");
  });
});

describe("CmssyLayout", () => {
  beforeEach(() => clearRegistry());

  const Header = ({ content }: { content: Record<string, unknown> }) => (
    <header>{String(content.brand ?? "")}</header>
  );

  const groups = [
    {
      position: "header",
      blocks: [
        {
          id: "h2",
          type: "header",
          content: { en: { brand: "B2" } },
          order: 1,
          isActive: true,
        },
        {
          id: "h1",
          type: "header",
          content: { en: { brand: "B1" } },
          order: 0,
          isActive: true,
        },
        {
          id: "hx",
          type: "header",
          content: { en: { brand: "Off" } },
          order: 2,
          isActive: false,
        },
      ],
    },
    { position: "footer", blocks: [] },
  ];

  it("renders active blocks for the position, sorted by order, filtering inactive", () => {
    registerComponent(Header, { type: "header", props: {} });
    const html = renderToStaticMarkup(
      <CmssyLayout groups={groups} position="header" locale="en" />,
    );
    expect(html).toContain('data-block-id="h1"');
    expect(html.indexOf("B1")).toBeLessThan(html.indexOf("B2"));
    expect(html).not.toContain("Off");
  });

  it("renders nothing for a position with no active blocks", () => {
    registerComponent(Header, { type: "header", props: {} });
    expect(
      renderToStaticMarkup(
        <CmssyLayout groups={groups} position="footer" locale="en" />,
      ),
    ).toBe("");
  });
});

describe("block-array helpers (registry-free)", () => {
  const heroBlock = defineBlock({
    type: "hero",
    label: "Hero",
    component: Hero,
    props: { heading: fields.singleLine() },
  });
  const footerBlock = defineBlock({
    type: "footer",
    label: "Footer",
    component: Hero,
    layoutPositions: ["footer"],
    props: { brand: fields.singleLine() },
  });

  it("buildBlockMap maps type to component", () => {
    const map = buildBlockMap([heroBlock, footerBlock]);
    expect(map.hero).toBe(Hero);
    expect(map.footer).toBe(Hero);
    expect(map.missing).toBeUndefined();
  });

  it("buildBlockMap is prototype-safe (odd block types resolve to undefined)", () => {
    const map = buildBlockMap([heroBlock]) as Record<string, unknown>;
    expect(map.toString).toBeUndefined();
    expect(map.constructor).toBeUndefined();
    expect(map.__proto__).toBeUndefined();
  });

  it("blocksToSchemas derives field schemas with key fallback labels", () => {
    const schemas = blocksToSchemas([heroBlock]);
    expect(schemas.hero?.heading?.type).toBe("singleLine");
    expect(schemas.hero?.heading?.label).toBe("heading");
  });

  it("blocksToMeta derives label/category/layoutPositions", () => {
    const meta = blocksToMeta([heroBlock, footerBlock], {
      category: "kancelaria",
    });
    expect(meta.hero).toEqual({ label: "Hero", category: "kancelaria" });
    expect(meta.footer).toEqual({
      label: "Footer",
      category: "kancelaria",
      layoutPositions: ["footer"],
    });
  });
});

describe("CmssyServerPage / CmssyServerLayout (static-map, no registry)", () => {
  beforeEach(() => clearRegistry());

  const heroBlock = defineBlock({
    type: "hero",
    label: "Hero",
    component: Hero,
    props: { heading: fields.singleLine() },
  });

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
