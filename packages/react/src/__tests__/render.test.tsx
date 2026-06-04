import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CmssyPage } from "../components/cmssy-page";
import { CmssyClientPage } from "../components/cmssy-client-page";
import { CmssyLayout } from "../components/cmssy-layout";
import {
  registerComponent,
  clearRegistry,
  defineBlock,
  getRegisteredComponent,
} from "../registry";
import { CmssyRegistry } from "../components/cmssy-registry";
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

describe("CmssyRegistry", () => {
  beforeEach(() => clearRegistry());

  it("registers the passed blocks on (SSR) render with a default category", () => {
    const heroBlock = defineBlock({
      type: "hero",
      label: "Hero",
      component: Hero,
      props: { heading: fields.singleLine() },
    });
    const out = renderToStaticMarkup(
      <CmssyRegistry blocks={[heroBlock]} category="kancelaria" />,
    );
    expect(out).toBe("");
    const reg = getRegisteredComponent("hero");
    expect(reg?.label).toBe("Hero");
    expect(reg?.category).toBe("kancelaria");
    expect(reg?.schema.heading?.type).toBe("singleLine");
  });
});
