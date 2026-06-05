// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { CmssyPage } from "../components/cmssy-page";
import { CmssyEditablePage } from "../components/editable-page";
import { registerComponent, clearRegistry, defineBlock } from "../registry";
import { fields } from "../fields";
import { PROTOCOL_VERSION } from "../bridge/protocol";

const editorOrigin = "https://editor.cmssy.io";

const Hero = ({ content }: { content: Record<string, unknown> }) => (
  <h1>
    {String(content.heading ?? "")}|{String(content.sub ?? "")}
  </h1>
);

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

let mockParent: { postMessage: ReturnType<typeof vi.fn> };

function setParent(value: unknown) {
  Object.defineProperty(window, "parent", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("edit bridge", () => {
  beforeEach(() => {
    cleanup();
    clearRegistry();
    registerComponent(Hero, {
      type: "hero",
      props: { heading: fields.singleLine() },
    });
    mockParent = { postMessage: vi.fn() };
    setParent(mockParent);
  });

  afterEach(() => {
    setParent(window);
  });

  it("posts cmssy:ready (with schemas) on mount", () => {
    render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "cmssy:ready",
        protocolVersion: PROTOCOL_VERSION,
        schemas: expect.objectContaining({ hero: expect.anything() }),
      }),
      editorOrigin,
    );
  });

  it("uses config-supplied schemas/blockMeta over the registry", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{
          editorOrigin,
          schemas: { fromData: { x: { type: "singleLine", label: "X" } } },
          blockMeta: { fromData: { label: "From Data" } },
        }}
      />,
    );
    const ready = mockParent.postMessage.mock.calls.find(
      (c) => (c[0] as { type?: string })?.type === "cmssy:ready",
    )?.[0] as {
      schemas: Record<string, unknown>;
      blockMeta: Record<string, unknown>;
    };
    expect(ready.schemas.fromData).toBeDefined();
    expect(ready.schemas.hero).toBeUndefined();
    expect(ready.blockMeta.fromData).toEqual({ label: "From Data" });
  });

  it("posts cmssy:ready with blockMeta (label + layoutPositions) so /layouts can list layout blocks", () => {
    registerComponent(Hero, {
      type: "site-header",
      label: "Site Header",
      icon: "layout-panel-top",
      layoutPositions: ["header"],
      props: { heading: fields.singleLine() },
    });
    render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    const call = mockParent.postMessage.mock.calls.find(
      (c) => (c[0] as { type?: string })?.type === "cmssy:ready",
    );
    const ready = call?.[0] as {
      blockMeta: Record<
        string,
        { label: string; icon?: string; layoutPositions?: string[] }
      >;
    };
    expect(ready.blockMeta.hero).toEqual({ label: "hero" });
    expect(ready.blockMeta["site-header"]).toEqual({
      label: "Site Header",
      icon: "layout-panel-top",
      layoutPositions: ["header"],
    });
  });

  it("preserves repeater itemSchema and options in the emitted cmssy:ready schema", () => {
    registerComponent(Hero, {
      type: "stats",
      props: {
        items: fields.repeater({
          label: "Items",
          minItems: 1,
          maxItems: 5,
          itemSchema: {
            value: fields.numeric({ label: "Value" }),
            label: fields.singleLine({ label: "Label" }),
          },
        }),
      },
    });
    render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    const readyCall = mockParent.postMessage.mock.calls.find(
      (c) => (c[0] as { type?: string })?.type === "cmssy:ready",
    );
    const ready = readyCall![0] as {
      schemas: {
        stats: {
          items: {
            type: string;
            minItems: number;
            maxItems: number;
            itemSchema: { value: { type: string }; label: { type: string } };
          };
        };
      };
    };
    const items = ready.schemas.stats.items;
    expect(items.type).toBe("repeater");
    expect(items.minItems).toBe(1);
    expect(items.maxItems).toBe(5);
    expect(items.itemSchema.value.type).toBe("numeric");
    expect(items.itemSchema.label.type).toBe("singleLine");
  });

  it("prevents default for a link click inside a block but still selects it", () => {
    const Linked = () => <a href="/somewhere">go</a>;
    clearRegistry();
    registerComponent(Linked, { type: "linked", props: {} });
    const linkedPage = {
      id: "pl",
      blocks: [{ id: "lb", type: "linked", content: {} }],
    };
    const { container } = render(
      <CmssyEditablePage
        page={linkedPage}
        locale="en"
        edit={{ editorOrigin }}
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

  it("does not prevent default for a non-link click inside a block", () => {
    const { container } = render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    const inner = container.querySelector("h1")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      inner.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(false);
  });

  it("posts cmssy:click with the block id and rect when a block is clicked", () => {
    const { container } = render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
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
          width: expect.any(Number),
          height: expect.any(Number),
        }),
      }),
      editorOrigin,
    );
  });

  it("does not post cmssy:click when the click is outside any block", () => {
    render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    mockParent.postMessage.mockClear();
    act(() => {
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const clickCalls = mockParent.postMessage.mock.calls.filter(
      (c) => (c[0] as { type?: string })?.type === "cmssy:click",
    );
    expect(clickCalls).toHaveLength(0);
  });

  it("re-sends cmssy:ready on cmssy:parent-ready", async () => {
    render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
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

  it("re-sends cmssy:ready when navigating to a page with the same block signature", async () => {
    const pageA = {
      id: "pA",
      blocks: [
        { id: "b1", type: "hero", content: { en: { heading: "A", sub: "1" } } },
      ],
    };
    const pageB = {
      id: "pB",
      blocks: [
        { id: "b1", type: "hero", content: { en: { heading: "B", sub: "2" } } },
      ],
    };
    const { rerender } = render(
      <CmssyEditablePage page={pageA} locale="en" edit={{ editorOrigin }} />,
    );
    expect(mockParent.postMessage).toHaveBeenCalledTimes(1);
    await act(async () => {
      rerender(
        <CmssyEditablePage page={pageB} locale="en" edit={{ editorOrigin }} />,
      );
    });
    expect(mockParent.postMessage).toHaveBeenCalledTimes(2);
  });

  it("live-patches a block on cmssy:patch, merging over the base content", async () => {
    const { container } = render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    expect(container.textContent).toContain("Hello|World");
    await act(async () => {
      window.dispatchEvent(patchEvent(editorOrigin, { heading: "Edited" }));
    });
    expect(container.textContent).toContain("Edited|World");
  });

  it("ignores a patch from a wrong origin", async () => {
    const { container } = render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    await act(async () => {
      window.dispatchEvent(
        patchEvent("https://evil.com", { heading: "Hacked" }),
      );
    });
    expect(container.textContent).toContain("Hello|World");
    expect(container.textContent).not.toContain("Hacked");
  });

  it("ignores a patch whose source is not window.parent", async () => {
    const { container } = render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
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
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    await act(async () => {
      window.dispatchEvent(
        patchEvent(editorOrigin, { heading: "Ghost" }, "does-not-exist"),
      );
    });
    expect(container.textContent).toContain("Hello|World");
    expect(container.textContent).not.toContain("Ghost");
  });

  it("resets patches when navigating to a different page (no stale overlay)", async () => {
    const pageA = {
      id: "pA",
      blocks: [
        { id: "b1", type: "hero", content: { en: { heading: "A", sub: "1" } } },
      ],
    };
    const pageB = {
      id: "pB",
      blocks: [
        { id: "b1", type: "hero", content: { en: { heading: "B", sub: "2" } } },
      ],
    };
    const { container, rerender } = render(
      <CmssyEditablePage page={pageA} locale="en" edit={{ editorOrigin }} />,
    );
    await act(async () => {
      window.dispatchEvent(patchEvent(editorOrigin, { heading: "Edited" }));
    });
    expect(container.textContent).toContain("Edited|1");
    await act(async () => {
      rerender(
        <CmssyEditablePage page={pageB} locale="en" edit={{ editorOrigin }} />,
      );
    });
    expect(container.textContent).toContain("B|2");
    expect(container.textContent).not.toContain("Edited");
  });

  it("resets patches when the block set changes on the same page id", async () => {
    const before = {
      id: "p",
      blocks: [
        { id: "b1", type: "hero", content: { en: { heading: "A", sub: "1" } } },
      ],
    };
    const after = {
      id: "p",
      blocks: [
        { id: "b1", type: "hero", content: { en: { heading: "X", sub: "Y" } } },
        { id: "b2", type: "hero", content: { en: { heading: "Z", sub: "W" } } },
      ],
    };
    const { container, rerender } = render(
      <CmssyEditablePage page={before} locale="en" edit={{ editorOrigin }} />,
    );
    await act(async () => {
      window.dispatchEvent(patchEvent(editorOrigin, { heading: "Edited" }));
    });
    expect(container.textContent).toContain("Edited|1");
    await act(async () => {
      rerender(
        <CmssyEditablePage page={after} locale="en" edit={{ editorOrigin }} />,
      );
    });
    expect(container.textContent).toContain("X|Y");
    expect(container.textContent).not.toContain("Edited");
  });

  it("renders a block inserted via cmssy:insert at the given index, before the base block", async () => {
    const { container } = render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
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

  it("live-patches an inserted block by its editor-minted id", async () => {
    const { container } = render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
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
            index: 1,
            protocolVersion: PROTOCOL_VERSION,
          },
        }),
      );
    });
    await act(async () => {
      window.dispatchEvent(
        patchEvent(editorOrigin, { heading: "Edited" }, "new-1"),
      );
    });
    expect(container.textContent).toContain("Edited|Inserted");
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
      />,
    );
    expect(
      Array.from(container.querySelectorAll("h1")).map((h) => h.textContent),
    ).toEqual(["First|", "Second|"]);
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
    expect(container.textContent).toContain("Keep|");
    expect(container.textContent).not.toContain("Gone|");
  });

  it("does not post or accept patches when not framed (parent === self)", async () => {
    setParent(window);
    const postSpy = vi.spyOn(window, "postMessage");
    const { container } = render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    expect(postSpy).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(patchEvent(editorOrigin, { heading: "Edited" }));
    });
    expect(container.textContent).toContain("Hello|World");
    postSpy.mockRestore();
  });

  it("does not crash the host when postMessage throws (invalid origin)", () => {
    mockParent.postMessage.mockImplementation(() => {
      throw new Error("invalid target origin");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin: "not-an-origin" }}
      />,
    );
    expect(container.textContent).toContain("Hello|World");
    warn.mockRestore();
  });

  it("the server CmssyPage does not mount the bridge", () => {
    render(<CmssyPage page={page} locale="en" />);
    expect(mockParent.postMessage).not.toHaveBeenCalled();
  });
});

describe("edit bridge (blocks-driven, no registry)", () => {
  const heroBlock = defineBlock({
    type: "hero",
    label: "Hero",
    component: Hero,
    props: { heading: fields.singleLine(), sub: fields.singleLine() },
  });
  const blocks = [heroBlock];

  function readyMessage() {
    return mockParent.postMessage.mock.calls.find(
      (c) => (c[0] as { type?: string })?.type === "cmssy:ready",
    )?.[0] as {
      schemas: Record<string, unknown>;
      blockMeta: Record<string, unknown>;
    };
  }

  beforeEach(() => {
    cleanup();
    // Empty registry: rendering must come from the passed array, not globals.
    clearRegistry();
    mockParent = { postMessage: vi.fn() };
    setParent(mockParent);
  });

  afterEach(() => {
    setParent(window);
  });

  it("renders blocks from the passed array without registering them", () => {
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
          schemas: { custom: { x: { type: "singleLine", label: "X" } } },
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

  it("live-patches a block sourced from the array", async () => {
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

  it("inserts a block sourced from the array", async () => {
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

  it("reorders blocks sourced from the array", async () => {
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

  it("removes a block sourced from the array", async () => {
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

  it("hides a block whose type is absent from the array (no registry fallback)", () => {
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
    expect(wrapper?.style.display).toBe("none");
  });
});
