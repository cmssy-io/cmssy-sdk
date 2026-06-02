// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { CmssyPage } from "../components/cmssy-page";
import { CmssyEditablePage } from "../components/editable-page";
import { registerComponent, clearRegistry } from "../registry";
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
