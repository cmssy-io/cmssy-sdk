import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CmssyPage } from "../components/cmssy-page";
import { registerComponent, clearRegistry } from "../registry";
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

  it("renders a placeholder for an unregistered block type", () => {
    const page = {
      id: "p",
      blocks: [{ id: "b2", type: "ghost", content: {} }],
    };
    const html = renderToStaticMarkup(<CmssyPage page={page} />);
    expect(html).toContain('data-cmssy-unknown-block="ghost"');
  });

  it("renders nothing for a null page", () => {
    expect(renderToStaticMarkup(<CmssyPage page={null} />)).toBe("");
  });
});
