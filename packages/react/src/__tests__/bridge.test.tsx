// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { CmssyServerPage } from "../components/cmssy-server-page";
import { CmssyEditablePage } from "../components/editable-page";
import { defineBlock, propsToSchema, type BlockProps } from "../registry";
import { fields } from "@cmssy/core";
import { PROTOCOL_VERSION } from "@cmssy/core";

const editorOrigin = "https://editor.cmssy.io";

const heroProps = { heading: fields.text(), sub: fields.text() };

const Hero = ({ content }: BlockProps<typeof heroProps>) => (
  <h1>
    {content.heading ?? ""}|{content.sub ?? ""}
  </h1>
);

const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: heroProps,
});
const blocks = [heroBlock];

const page = {
  id: "p",
  blocks: [
    {
      id: "b1",
      type: "hero",
      content: { en: { heading: "Hello", sub: "World" } },
    },
  ],
};

function patchEvent(
  origin: string,
  content: Record<string, unknown>,
  blockId = "b1",
  source: MessageEventSource | null = null,
) {
  return new MessageEvent("message", {
    origin,
    source,
    data: {
      type: "cmssy:patch",
      blockId,
      content,
      protocolVersion: PROTOCOL_VERSION,
    },
  });
}

function viewportEvent(origin: string, width: number, height: number) {
  return new MessageEvent("message", {
    origin,
    data: {
      type: "cmssy:viewport",
      protocolVersion: PROTOCOL_VERSION,
      width,
      height,
    },
  });
}

function bucketPatchEvent(
  origin: string,
  buckets: {
    style?: Record<string, unknown>;
    advanced?: Record<string, unknown>;
  },
  blockId = "b1",
) {
  return new MessageEvent("message", {
    origin,
    source: null,
    data: {
      type: "cmssy:patch",
      blockId,
      content: {},
      ...buckets,
      protocolVersion: PROTOCOL_VERSION,
    },
  });
}

function selectEvent(origin: string, blockId = "b1") {
  return new MessageEvent("message", {
    origin,
    source: null,
    data: { type: "cmssy:select", blockId, protocolVersion: PROTOCOL_VERSION },
  });
}

const styledProps = { heading: fields.text() };

const Styled = ({
  content,
  style,
  advanced,
}: BlockProps<typeof styledProps>) => (
  <div>
    {content.heading ?? ""}|{String(style?.bg ?? "none")}|
    {String(advanced?.anchor ?? "none")}
  </div>
);
const styledBlock = defineBlock({
  type: "styled",
  label: "Styled",
  component: Styled,
  props: styledProps,
});
const styledPage = {
  id: "sp",
  blocks: [{ id: "b1", type: "styled", content: { en: { heading: "Hi" } } }],
};

let mockParent: { postMessage: ReturnType<typeof vi.fn> };

function setParent(value: unknown) {
  Object.defineProperty(window, "parent", {
    value,
    configurable: true,
    writable: true,
  });
}

function readyMessage() {
  return mockParent.postMessage.mock.calls.find(
    (c) => (c[0] as { type?: string })?.type === "cmssy:ready",
  )?.[0] as {
    schemas: Record<string, unknown>;
    blockMeta: Record<string, unknown>;
  };
}

describe("edit bridge (blocks-driven)", () => {
  beforeEach(() => {
    cleanup();
    mockParent = { postMessage: vi.fn() };
    setParent(mockParent);
  });

  afterEach(() => {
    setParent(window);
  });

  it("renders blocks from the passed array", () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    expect(container.textContent).toContain("Hello|World");
  });

  it("derives cmssy:ready schemas/blockMeta from the blocks array", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    const ready = readyMessage();
    expect(ready.schemas.hero).toBeDefined();
    expect(ready.blockMeta.hero).toEqual({ label: "Hero" });
  });

  it("applies the category prop to derived blockMeta", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
        category="Marketing"
      />,
    );
    expect(readyMessage().blockMeta.hero).toEqual({
      label: "Hero",
      category: "Marketing",
    });
  });

  it("lets explicit edit.schemas/blockMeta override the derived ones", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{
          editorOrigin,
          schemas: { custom: { x: { type: "text", label: "X" } } },
          blockMeta: { custom: { label: "Custom" } },
        }}
        blocks={blocks}
      />,
    );
    const ready = readyMessage();
    expect(ready.schemas.custom).toBeDefined();
    expect(ready.schemas.hero).toBeUndefined();
    expect(ready.blockMeta.custom).toEqual({ label: "Custom" });
  });

  it("live-patches a block, merging over the base content", async () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    expect(container.textContent).toContain("Hello|World");
    await act(async () => {
      window.dispatchEvent(patchEvent(editorOrigin, { heading: "Edited" }));
    });
    expect(container.textContent).toContain("Edited|World");
  });

  it("scrolls the selected block into view on cmssy:select", async () => {
    const scrollSpy = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollSpy;
    try {
      const { container } = render(
        <CmssyEditablePage
          page={page}
          locale="en"
          edit={{ editorOrigin }}
          blocks={blocks}
        />,
      );
      expect(container.querySelector('[data-block-id="b1"]')).not.toBeNull();
      await act(async () => {
        window.dispatchEvent(selectEvent(editorOrigin, "b1"));
      });
      expect(scrollSpy).toHaveBeenCalledWith(
        expect.objectContaining({ block: "nearest" }),
      );
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("reports the selected block's bounds without waiting for a scroll", async () => {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    try {
      render(
        <CmssyEditablePage
          page={page}
          locale="en"
          edit={{ editorOrigin }}
          blocks={blocks}
        />,
      );
      mockParent.postMessage.mockClear();

      await act(async () => {
        window.dispatchEvent(selectEvent(editorOrigin, "b1"));
      });
      await act(async () => {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      });

      const bounds = mockParent.postMessage.mock.calls.find(
        (c) => (c[0] as { type?: string })?.type === "cmssy:bounds",
      )?.[0] as { blockId?: string } | undefined;
      expect(bounds?.blockId).toBe("b1");
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("live-patches the style and advanced buckets independently of content", async () => {
    const { container } = render(
      <CmssyEditablePage
        page={styledPage}
        locale="en"
        edit={{ editorOrigin }}
        blocks={[styledBlock]}
      />,
    );
    expect(container.textContent).toContain("Hi|none|none");
    await act(async () => {
      window.dispatchEvent(
        bucketPatchEvent(editorOrigin, {
          style: { bg: "navy" },
          advanced: { anchor: "top" },
        }),
      );
    });
    expect(container.textContent).toContain("Hi|navy|top");
  });

  it("ignores a patch from a wrong origin", async () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    await act(async () => {
      window.dispatchEvent(
        patchEvent("https://evil.com", { heading: "Hacked" }),
      );
    });
    expect(container.textContent).toContain("Hello|World");
    expect(container.textContent).not.toContain("Hacked");
  });

  it("accepts a patch from any configured origin when several are allowed", async () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin: ["https://cmssy.io", "https://www.cmssy.io"] }}
        blocks={blocks}
      />,
    );
    await act(async () => {
      window.dispatchEvent(
        patchEvent("https://www.cmssy.io", { heading: "Edited" }),
      );
    });
    expect(container.textContent).toContain("Edited|World");
  });

  it("still rejects an origin outside the configured allow-list", async () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin: ["https://cmssy.io", "https://www.cmssy.io"] }}
        blocks={blocks}
      />,
    );
    await act(async () => {
      window.dispatchEvent(
        patchEvent("https://evil.com", { heading: "Hacked" }),
      );
    });
    expect(container.textContent).toContain("Hello|World");
    expect(container.textContent).not.toContain("Hacked");
  });

  it("inserts a block at the given index, before the base block", async () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: editorOrigin,
          source: null,
          data: {
            type: "cmssy:insert",
            blockId: "new-1",
            blockType: "hero",
            content: { heading: "Fresh", sub: "Inserted" },
            index: 0,
            protocolVersion: PROTOCOL_VERSION,
          },
        }),
      );
    });
    const headings = Array.from(container.querySelectorAll("h1")).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(["Fresh|Inserted", "Hello|World"]);
  });

  it("reorders rendered blocks on cmssy:reorder", async () => {
    const twoBlocks = {
      id: "p2",
      blocks: [
        { id: "b1", type: "hero", content: { en: { heading: "First" } } },
        { id: "b2", type: "hero", content: { en: { heading: "Second" } } },
      ],
    };
    const { container } = render(
      <CmssyEditablePage
        page={twoBlocks}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: editorOrigin,
          source: null,
          data: {
            type: "cmssy:reorder",
            blockIds: ["b2", "b1"],
            protocolVersion: PROTOCOL_VERSION,
          },
        }),
      );
    });
    expect(
      Array.from(container.querySelectorAll("h1")).map((h) => h.textContent),
    ).toEqual(["Second|", "First|"]);
  });

  it("drops a block from the render on cmssy:remove", async () => {
    const twoBlocks = {
      id: "p3",
      blocks: [
        { id: "b1", type: "hero", content: { en: { heading: "Keep" } } },
        { id: "b2", type: "hero", content: { en: { heading: "Gone" } } },
      ],
    };
    const { container } = render(
      <CmssyEditablePage
        page={twoBlocks}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    expect(container.textContent).toContain("Gone|");
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: editorOrigin,
          source: null,
          data: {
            type: "cmssy:remove",
            blockId: "b2",
            protocolVersion: PROTOCOL_VERSION,
          },
        }),
      );
    });
    expect(container.textContent).not.toContain("Gone|");
  });

  it("announces the declared layout regions in cmssy:ready", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{
          editorOrigin,
          layoutRegions: [
            { id: "header" },
            { id: "sidebar_left", label: "Aside" },
          ],
        }}
        blocks={blocks}
      />,
    );
    const ready = readyMessage() as unknown as Record<string, unknown>;
    expect(ready.layoutRegions).toEqual([
      { id: "header" },
      { id: "sidebar_left", label: "Aside" },
    ]);
  });

  it("serializes region settings into cmssy:ready like block props", () => {
    const settings = {
      showOnMobile: fields.boolean(),
      width: fields.number({ label: "Width (px)", required: true }),
    };
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{
          editorOrigin,
          layoutRegions: [{ id: "header" }, { id: "sidebar_left", settings }],
        }}
        blocks={blocks}
      />,
    );
    const ready = readyMessage() as unknown as {
      layoutRegions: Array<Record<string, unknown>>;
    };
    expect(ready.layoutRegions).toStrictEqual([
      { id: "header" },
      {
        id: "sidebar_left",
        settings: propsToSchema(settings),
      },
    ]);
    expect(ready.layoutRegions[1]?.settings).toStrictEqual({
      showOnMobile: { type: "boolean", label: "showOnMobile" },
      width: { type: "number", label: "Width (px)", required: true },
    });
  });

  it("omits layoutRegions from cmssy:ready when the site declares none", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    const ready = readyMessage() as unknown as Record<string, unknown>;
    expect("layoutRegions" in ready).toBe(false);
  });

  it("re-sends cmssy:ready on cmssy:parent-ready", async () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    expect(mockParent.postMessage).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: editorOrigin,
          data: {
            type: "cmssy:parent-ready",
            protocolVersion: PROTOCOL_VERSION,
          },
        }),
      );
    });
    expect(mockParent.postMessage).toHaveBeenCalledTimes(2);
  });

  it("renders an error card for a block whose type is absent from the array", () => {
    const orphan = {
      id: "po",
      blocks: [{ id: "bx", type: "missing", content: { en: {} } }],
    };
    const { container } = render(
      <CmssyEditablePage
        page={orphan}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    const wrapper = container.querySelector(
      '[data-block-id="bx"]',
    ) as HTMLElement | null;
    expect(wrapper?.style.display).not.toBe("none");
    const card = wrapper?.querySelector("[data-cmssy-block-error]");
    expect(card?.getAttribute("data-cmssy-block-error")).toBe("unregistered");
    expect(card?.textContent).toContain("missing");
  });

  it("prevents default for a link click inside a block but still selects it", () => {
    const Linked = () => <a href="/somewhere">go</a>;
    const linkedBlocks = [
      defineBlock({ type: "linked", component: Linked, props: {} }),
    ];
    const linkedPage = {
      id: "pl",
      blocks: [{ id: "lb", type: "linked", content: {} }],
    };
    const { container } = render(
      <CmssyEditablePage
        page={linkedPage}
        locale="en"
        edit={{ editorOrigin }}
        blocks={linkedBlocks}
      />,
    );
    const link = container.querySelector("a")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      link.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cmssy:click", blockId: "lb" }),
      editorOrigin,
    );
  });

  it("stops a block link click in the capture phase so SPA router handlers never run", () => {
    const Linked = () => <a href="/somewhere">go</a>;
    const linkedBlocks = [
      defineBlock({ type: "linked", component: Linked, props: {} }),
    ];
    const linkedPage = {
      id: "pl",
      blocks: [{ id: "lb", type: "linked", content: {} }],
    };
    const { container } = render(
      <CmssyEditablePage
        page={linkedPage}
        locale="en"
        edit={{ editorOrigin }}
        blocks={linkedBlocks}
      />,
    );
    const link = container.querySelector("a")!;
    const routerHandler = vi.fn();
    link.addEventListener("click", routerHandler);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      link.dispatchEvent(ev);
    });
    expect(routerHandler).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cmssy:click", blockId: "lb" }),
      editorOrigin,
    );
  });

  it("posts cmssy:deselect on pagehide while a block is selected", () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    act(() => {
      container
        .querySelector("h1")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    mockParent.postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      { type: "cmssy:deselect" },
      editorOrigin,
    );
  });

  it("posts cmssy:deselect when the bridge unmounts while a block is selected", () => {
    const { container, unmount } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    act(() => {
      container
        .querySelector("h1")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    mockParent.postMessage.mockClear();
    unmount();
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      { type: "cmssy:deselect" },
      editorOrigin,
    );
  });

  it("does not post cmssy:deselect on unmount when nothing is selected", () => {
    const { unmount } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    mockParent.postMessage.mockClear();
    unmount();
    expect(mockParent.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "cmssy:deselect" }),
      expect.anything(),
    );
  });

  it("posts cmssy:click with the block id and rect on click", () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    const inner = container.querySelector("h1")!;
    act(() => {
      inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "cmssy:click",
        blockId: "b1",
        rect: expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
        }),
      }),
      editorOrigin,
    );
  });

  it("posts cmssy:deselect when clicking outside any block after a selection", () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    act(() => {
      container
        .querySelector("h1")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    mockParent.postMessage.mockClear();
    act(() => {
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      { type: "cmssy:deselect" },
      editorOrigin,
    );
  });

  it("does not post cmssy:deselect when nothing is selected", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    mockParent.postMessage.mockClear();
    act(() => {
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mockParent.postMessage).not.toHaveBeenCalled();
  });

  it("keeps the selection when the outside click lands on a link or button", () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    act(() => {
      container
        .querySelector("h1")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    mockParent.postMessage.mockClear();
    const link = document.createElement("a");
    link.setAttribute("href", "/other-page");
    document.body.appendChild(link);
    act(() => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    link.remove();
    expect(mockParent.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "cmssy:deselect" }),
      expect.anything(),
    );
  });

  it("re-posts cmssy:bounds for the selected block on scroll", () => {
    let rafCb: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCb = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    act(() => {
      container
        .querySelector("h1")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    mockParent.postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    act(() => {
      rafCb?.(0);
    });
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "cmssy:bounds",
        blockId: "b1",
        rect: expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
        }),
      }),
      editorOrigin,
    );
    vi.unstubAllGlobals();
  });

  it("does not schedule a frame on scroll when nothing is selected", () => {
    let rafCb: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCb = cb;
      return 1;
    });
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    mockParent.postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(rafCb).toBeNull();
    const boundsCalls = mockParent.postMessage.mock.calls.filter(
      (c) => (c[0] as { type?: string })?.type === "cmssy:bounds",
    );
    expect(boundsCalls).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("ignores a patch whose source is not window.parent", async () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    await act(async () => {
      window.dispatchEvent(
        patchEvent(editorOrigin, { heading: "Spoofed" }, "b1", window),
      );
    });
    expect(container.textContent).toContain("Hello|World");
    expect(container.textContent).not.toContain("Spoofed");
  });

  it("ignores a patch for an unknown block id", async () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    await act(async () => {
      window.dispatchEvent(
        patchEvent(editorOrigin, { heading: "Ghost" }, "does-not-exist"),
      );
    });
    expect(container.textContent).toContain("Hello|World");
    expect(container.textContent).not.toContain("Ghost");
  });

  it("does not post or accept patches when not framed (parent === self)", async () => {
    setParent(window);
    const postSpy = vi.spyOn(window, "postMessage");
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    expect(postSpy).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(patchEvent(editorOrigin, { heading: "Edited" }));
    });
    expect(container.textContent).toContain("Hello|World");
    postSpy.mockRestore();
  });

  it("fires a window resize when the editor reports a new preview size", async () => {
    const onResize = vi.fn();
    window.addEventListener("resize", onResize);
    try {
      render(
        <CmssyEditablePage
          page={page}
          locale="en"
          edit={{ editorOrigin }}
          blocks={blocks}
        />,
      );
      await act(async () => {
        window.dispatchEvent(viewportEvent(editorOrigin, 390, 844));
      });
      expect(onResize).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("resize", onResize);
    }
  });

  it("ignores a viewport report from another origin", async () => {
    const onResize = vi.fn();
    window.addEventListener("resize", onResize);
    try {
      render(
        <CmssyEditablePage
          page={page}
          locale="en"
          edit={{ editorOrigin }}
          blocks={blocks}
        />,
      );
      await act(async () => {
        window.dispatchEvent(viewportEvent("https://evil.example", 390, 844));
      });
      expect(onResize).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("resize", onResize);
    }
  });

  it("the server page does not mount the bridge", async () => {
    render(await CmssyServerPage({ page, blocks, locale: "en" }));
    expect(mockParent.postMessage).not.toHaveBeenCalled();
  });

  it("throws when blocks is not an array", () => {
    expect(() =>
      render(
        <CmssyEditablePage
          page={page}
          locale="en"
          edit={{ editorOrigin }}
          blocks={undefined as unknown as never}
        />,
      ),
    ).toThrow(/requires a blocks array/);
  });

  it("includes DOM layout blocks (data-layout-position) in cmssy:ready, tagged with layoutPosition", () => {
    const layoutEl = document.createElement("div");
    layoutEl.setAttribute("data-block-id", "lay1");
    layoutEl.setAttribute("data-block-type", "site-header");
    layoutEl.setAttribute("data-layout-position", "header");
    document.body.appendChild(layoutEl);
    try {
      render(
        <CmssyEditablePage
          page={page}
          locale="en"
          edit={{ editorOrigin }}
          blocks={blocks}
        />,
      );
      const ready = readyMessage() as unknown as {
        blocks: Array<{ id: string; type: string; layoutPosition?: string }>;
      };
      expect(ready.blocks.find((b) => b.id === "lay1")).toMatchObject({
        id: "lay1",
        type: "site-header",
        layoutPosition: "header",
      });
      expect(
        ready.blocks.find((b) => b.id === "b1")?.layoutPosition,
      ).toBeUndefined();
    } finally {
      document.body.removeChild(layoutEl);
    }
  });

  it("de-duplicates layout blocks that share a data-block-id (responsive variants)", () => {
    const make = () => {
      const el = document.createElement("div");
      el.setAttribute("data-block-id", "dup1");
      el.setAttribute("data-block-type", "site-header");
      el.setAttribute("data-layout-position", "header");
      return el;
    };
    const a = make();
    const b = make();
    document.body.appendChild(a);
    document.body.appendChild(b);
    try {
      render(
        <CmssyEditablePage
          page={page}
          locale="en"
          edit={{ editorOrigin }}
          blocks={blocks}
        />,
      );
      const ready = readyMessage() as unknown as {
        blocks: Array<{ id: string }>;
      };
      expect(ready.blocks.filter((bl) => bl.id === "dup1")).toHaveLength(1);
    } finally {
      document.body.removeChild(a);
      document.body.removeChild(b);
    }
  });

  it("emits layoutPosition on cmssy:click for a layout block", () => {
    const layoutEl = document.createElement("div");
    layoutEl.setAttribute("data-block-id", "lay1");
    layoutEl.setAttribute("data-block-type", "site-header");
    layoutEl.setAttribute("data-layout-position", "header");
    document.body.appendChild(layoutEl);
    try {
      render(
        <CmssyEditablePage
          page={page}
          locale="en"
          edit={{ editorOrigin }}
          blocks={blocks}
        />,
      );
      act(() => {
        layoutEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(mockParent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "cmssy:click",
          blockId: "lay1",
          layoutPosition: "header",
        }),
        editorOrigin,
      );
    } finally {
      document.body.removeChild(layoutEl);
    }
  });

  it("ignores a cmssy:patch carrying a layoutPosition (page render unchanged)", async () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: editorOrigin,
          source: null,
          data: {
            type: "cmssy:patch",
            blockId: "b1",
            content: { heading: "Layout" },
            layoutPosition: "header",
            protocolVersion: PROTOCOL_VERSION,
          },
        }),
      );
    });
    expect(container.textContent).toContain("Hello|World");
    expect(container.textContent).not.toContain("Layout");
  });

  it("ignores a cmssy:patch carrying an empty-string layoutPosition", async () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: editorOrigin,
          source: null,
          data: {
            type: "cmssy:patch",
            blockId: "b1",
            content: { heading: "EmptyPos" },
            layoutPosition: "",
            protocolVersion: PROTOCOL_VERSION,
          },
        }),
      );
    });
    expect(container.textContent).toContain("Hello|World");
    expect(container.textContent).not.toContain("EmptyPos");
  });
});

type IntersectionEntry = { target: Element; isIntersecting: boolean };

class ViewportStub {
  static instances: ViewportStub[] = [];
  private readonly callback: (entries: IntersectionEntry[]) => void;

  constructor(callback: (entries: IntersectionEntry[]) => void) {
    this.callback = callback;
    ViewportStub.instances.push(this);
  }

  observe() {}
  disconnect() {}

  showEverything() {
    this.callback(
      [...document.querySelectorAll("[data-block-id]")].map((target) => ({
        target,
        isIntersecting: true,
      })),
    );
  }
}

const hiddenHeroProps = { heading: fields.text() };

const HiddenHero = ({ content }: BlockProps<typeof hiddenHeroProps>) => (
  <div style={{ opacity: 0 }}>
    <h1>{content.heading ?? ""}</h1>
  </div>
);

const hiddenPage = {
  id: "hp",
  blocks: [
    { id: "b1", type: "hidden-hero", content: { en: { heading: "Hi" } } },
  ],
};

describe("invisible block reporting", () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
    ViewportStub.instances.length = 0;
    vi.stubGlobal("IntersectionObserver", ViewportStub);
    mockParent = { postMessage: vi.fn() };
    setParent(mockParent);
  });

  afterEach(() => {
    setParent(window);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("tells the editor which blocks are mounted and painting nothing", () => {
    render(
      <CmssyEditablePage
        page={hiddenPage}
        locale="en"
        edit={{ editorOrigin }}
        blocks={[
          defineBlock({
            type: "hidden-hero",
            label: "Hidden hero",
            component: HiddenHero,
            props: hiddenHeroProps,
          }),
        ]}
      />,
    );

    act(() => ViewportStub.instances[0]!.showEverything());
    act(() => vi.advanceTimersByTime(1500));

    expect(mockParent.postMessage).toHaveBeenCalledWith(
      {
        type: "cmssy:invisible-blocks",
        protocolVersion: PROTOCOL_VERSION,
        blocks: [{ blockId: "b1", blockType: "hidden-hero" }],
      },
      editorOrigin,
    );
  });

  it("stays quiet about a page that paints", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );

    act(() => ViewportStub.instances[0]!.showEverything());
    act(() => vi.advanceTimersByTime(5000));

    const reports = mockParent.postMessage.mock.calls.filter(
      (call) =>
        (call[0] as { type?: string })?.type === "cmssy:invisible-blocks",
    );
    expect(reports).toEqual([]);
  });
});
