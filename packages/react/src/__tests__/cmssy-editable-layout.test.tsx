// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { CmssyEditableLayout } from "../components/cmssy-editable-layout";
import { defineBlock, type BlockProps } from "../registry";
import { fields } from "@cmssy/core";
import { PROTOCOL_VERSION } from "@cmssy/core";

const editorOrigin = "https://editor.cmssy.io";

const headerProps = { brand: fields.text() };

const Header = ({ content, context }: BlockProps<typeof headerProps>) => (
  <header data-page={context?.page?.slug ?? "none"}>
    {content.brand ?? ""}
  </header>
);

const blocks = [
  defineBlock({
    type: "site-header",
    label: "Header",
    component: Header,
    layoutRegions: ["header"],
    props: headerProps,
  }),
];

const groups = [
  {
    region: "header",
    blocks: [
      {
        id: "h2",
        type: "site-header",
        content: { en: { brand: "Second" } },
        order: 1,
        isActive: true,
      },
      {
        id: "h1",
        type: "site-header",
        content: { en: { brand: "First" } },
        order: 0,
        isActive: true,
      },
      {
        id: "hx",
        type: "site-header",
        content: { en: { brand: "Off" } },
        order: 2,
        isActive: false,
      },
    ],
  },
];

let mockParent: { postMessage: ReturnType<typeof vi.fn> };

function setParent(value: unknown) {
  Object.defineProperty(window, "parent", {
    value,
    configurable: true,
    writable: true,
  });
}

function patchEvent(
  blockId: string,
  content: Record<string, unknown>,
  layoutRegion?: string,
) {
  return new MessageEvent("message", {
    origin: editorOrigin,
    source: null,
    data: {
      type: "cmssy:patch",
      blockId,
      content,
      layoutRegion,
      protocolVersion: PROTOCOL_VERSION,
    },
  });
}

describe("CmssyEditableLayout", () => {
  beforeEach(() => {
    cleanup();
    mockParent = { postMessage: vi.fn() };
    setParent(mockParent);
  });

  afterEach(() => {
    setParent(window);
  });

  it("renders active blocks for the region, sorted by order, filtering inactive, tagged with data-layout-region", () => {
    const { container } = render(
      <CmssyEditableLayout
        groups={groups}
        blocks={blocks}
        region="header"
        locale="en"
        edit={{ editorOrigin }}
      />,
    );
    const headers = Array.from(container.querySelectorAll("header")).map(
      (h) => h.textContent,
    );
    expect(headers).toEqual(["First", "Second"]);
    expect(container.textContent).not.toContain("Off");
    const wrapper = container.querySelector('[data-block-id="h1"]');
    expect(wrapper?.getAttribute("data-layout-region")).toBe("header");
    expect(wrapper?.getAttribute("draggable")).toBeNull();
  });

  it("hands every block the routed page, and follows it when the route changes (CMS-1708)", () => {
    const { container, rerender } = render(
      <CmssyEditableLayout
        groups={groups}
        blocks={blocks}
        region="header"
        locale="en"
        edit={{ editorOrigin }}
        page={{ slug: "/docs" }}
      />,
    );
    const pageOf = () =>
      container.querySelector("header")?.getAttribute("data-page");
    expect(pageOf()).toBe("/docs");

    rerender(
      <CmssyEditableLayout
        groups={groups}
        blocks={blocks}
        region="header"
        locale="en"
        edit={{ editorOrigin }}
        page={{ slug: "/pricing" }}
      />,
    );
    expect(pageOf()).toBe("/pricing");
  });

  it("renders nothing for a region with no active blocks", () => {
    const { container } = render(
      <CmssyEditableLayout
        groups={groups}
        blocks={blocks}
        region="footer"
        locale="en"
        edit={{ editorOrigin }}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("live-patches a layout block on a matching-region cmssy:patch", async () => {
    const { container } = render(
      <CmssyEditableLayout
        groups={groups}
        blocks={blocks}
        region="header"
        locale="en"
        edit={{ editorOrigin }}
      />,
    );
    expect(container.textContent).toContain("First");
    await act(async () => {
      window.dispatchEvent(patchEvent("h1", { brand: "Edited" }, "header"));
    });
    expect(container.textContent).toContain("Edited");
    expect(container.textContent).not.toContain("First");
  });

  it("ignores a cmssy:patch targeting a different layout region", async () => {
    const { container } = render(
      <CmssyEditableLayout
        groups={groups}
        blocks={blocks}
        region="header"
        locale="en"
        edit={{ editorOrigin }}
      />,
    );
    await act(async () => {
      window.dispatchEvent(patchEvent("h1", { brand: "Footer" }, "footer"));
    });
    expect(container.textContent).toContain("First");
    expect(container.textContent).not.toContain("Footer");
  });

  it("ignores a page-scoped cmssy:patch (no layoutRegion)", async () => {
    const { container } = render(
      <CmssyEditableLayout
        groups={groups}
        blocks={blocks}
        region="header"
        locale="en"
        edit={{ editorOrigin }}
      />,
    );
    await act(async () => {
      window.dispatchEvent(patchEvent("h1", { brand: "PageScoped" }));
    });
    expect(container.textContent).toContain("First");
    expect(container.textContent).not.toContain("PageScoped");
  });
});
