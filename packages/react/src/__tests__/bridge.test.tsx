// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { CmssyServerPage } from "../components/cmssy-server-page";
import { CmssyEditablePage } from "../components/editable-page";
import { defineBlock } from "../registry";
import { fields } from "../fields";
import { PROTOCOL_VERSION } from "../bridge/protocol";

const editorOrigin = "https://editor.cmssy.io";

const Hero = ({ content }: { content: Record<string, unknown> }) => (
  <h1>
    {String(content.heading ?? "")}|{String(content.sub ?? "")}
  </h1>
);

const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: { heading: fields.singleLine(), sub: fields.singleLine() },
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

  it("hides a block whose type is absent from the array", () => {
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

  it("the server page does not mount the bridge", () => {
    render(<CmssyServerPage page={page} blocks={blocks} locale="en" />);
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
});
