// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CmssyBlock } from "../components/cmssy-block";
import { defineBlock, buildBlockMap } from "../registry";

const throwingBlock = defineBlock({
  type: "exploding",
  props: {},
  component: () => {
    throw new Error("boom at render");
  },
});

const map = buildBlockMap([throwingBlock]);
const block = { id: "b-explode", type: "exploding", content: {} };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BlockErrorBoundary via CmssyBlock", () => {
  it("renders the error card in edit mode when the component throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <CmssyBlock
        block={block}
        locale="en"
        defaultLocale="en"
        blockMap={map}
        editMode
      />,
    );
    const card = container.querySelector("[data-cmssy-block-error]");
    expect(card).not.toBeNull();
    expect(card?.getAttribute("data-cmssy-block-error")).toBe("render");
    expect(card?.textContent).toContain("exploding");
    expect(card?.textContent).toContain("b-explode");
    expect(card?.textContent).toContain("boom at render");
    expect(card?.textContent).toContain("render failed");
  });

  it("renders nothing in production and logs console.error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <CmssyBlock
        block={block}
        locale="en"
        defaultLocale="en"
        blockMap={map}
      />,
    );
    expect(container.querySelector("[data-cmssy-block-error]")).toBeNull();
    const wrapper = container.querySelector('[data-block-id="b-explode"]');
    expect(wrapper?.textContent ?? "").toBe("");
    expect(errorSpy).toHaveBeenCalledWith(
      '[cmssy] block "exploding" (b-explode) failed to render',
      expect.any(Error),
    );
  });
});
