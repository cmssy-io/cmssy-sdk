// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CmssyEditablePage } from "../components/editable-page";
import { defineBlock } from "../registry";
import { fields } from "../fields";
import { PROTOCOL_VERSION } from "../bridge/protocol";

const editorOrigin = "https://editor.cmssy.io";

const Hero = ({ content }: { content: Record<string, unknown> }) => (
  <h1>{String(content.heading ?? "")}</h1>
);

const blocks = [
  defineBlock({
    type: "hero",
    component: Hero,
    props: { heading: fields.text() },
  }),
];

const page = {
  id: "p",
  blocks: [
    { id: "b1", type: "hero", content: { en: { heading: "One" } } },
    { id: "b2", type: "hero", content: { en: { heading: "Two" } } },
  ],
};

let mockParent: { postMessage: ReturnType<typeof vi.fn> };

function setParent(value: unknown) {
  Object.defineProperty(window, "parent", {
    value,
    configurable: true,
    writable: true,
  });
}

// jsdom returns all-zero rects; stub each block's rect so the agent can
// compute an index from clientY. b1 occupies y 0..100, b2 100..200.
function stubBlockRects() {
  for (const el of Array.from(
    document.querySelectorAll<HTMLElement>("[data-block-id]"),
  )) {
    const id = el.getAttribute("data-block-id");
    const top = id === "b1" ? 0 : 100;
    el.getBoundingClientRect = () =>
      ({
        top,
        bottom: top + 100,
        height: 100,
        x: 0,
        y: top,
        left: 0,
        right: 0,
        width: 0,
        toJSON() {},
      }) as DOMRect;
    Object.defineProperty(el, "getClientRects", {
      value: () => [{}],
      configurable: true,
    });
  }
}

function stubBlockRectsCounting(counter: { n: number }) {
  for (const el of Array.from(
    document.querySelectorAll<HTMLElement>("[data-block-id]"),
  )) {
    const id = el.getAttribute("data-block-id");
    const top = id === "b1" ? 0 : 100;
    el.getBoundingClientRect = () => {
      counter.n++;
      return {
        top,
        bottom: top + 100,
        height: 100,
        x: 0,
        y: top,
        left: 0,
        right: 0,
        width: 0,
        toJSON() {},
      } as DOMRect;
    };
    Object.defineProperty(el, "getClientRects", {
      value: () => [{}],
      configurable: true,
    });
  }
}

function dropEvent(clientY: number, data: string | null, moveTarget?: Element) {
  const dt = {
    types: data ? ["application/x-cmssy-block"] : ["application/x-cmssy-move"],
    getData: (t: string) =>
      t === "application/x-cmssy-block" ? (data ?? "") : "",
    setData: () => {},
    set effectAllowed(_v: string) {},
  };
  const make = (type: string, target?: Element) => {
    const ev = new Event(type, { bubbles: true });
    Object.defineProperty(ev, "dataTransfer", { value: dt });
    Object.defineProperty(ev, "clientY", { value: clientY });
    if (target) Object.defineProperty(ev, "target", { value: target });
    ev.preventDefault = () => {};
    return ev;
  };
  return { make };
}

describe("drag agent", () => {
  beforeEach(() => {
    cleanup();
    mockParent = { postMessage: vi.fn() };
    setParent(mockParent);
  });
  afterEach(() => setParent(window));

  function dragOver(y: number) {
    return new MessageEvent("message", {
      origin: editorOrigin,
      source: null,
      data: { type: "cmssy:drag-over", y, protocolVersion: PROTOCOL_VERSION },
    });
  }

  it("reports cmssy:drag-index from the editor-forwarded cursor (drag-over)", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    stubBlockRects();
    window.dispatchEvent(dragOver(150)); // below b2 midpoint → index 2
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "cmssy:drag-index",
        protocolVersion: PROTOCOL_VERSION,
        index: 2,
      }),
      editorOrigin,
    );
  });

  it("excludes layout blocks (data-layout-position) from the page drop index", () => {
    const layoutEl = document.createElement("div");
    layoutEl.setAttribute("data-block-id", "lay1");
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
      stubBlockRects();
      window.dispatchEvent(dragOver(150));
      expect(mockParent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "cmssy:drag-index", index: 2 }),
        editorOrigin,
      );
    } finally {
      document.body.removeChild(layoutEl);
    }
  });

  it("auto-scrolls down when the drag-over cursor nears the bottom edge", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    stubBlockRects();
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    window.dispatchEvent(dragOver(window.innerHeight - 10));
    expect(scrollBy).toHaveBeenCalledWith(0, expect.any(Number));
    expect(scrollBy.mock.calls[0]![1]).toBeGreaterThan(0);
    scrollBy.mockRestore();
  });

  it("auto-scrolls up when the drag-over cursor nears the top edge", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    stubBlockRects();
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    window.dispatchEvent(dragOver(10));
    expect(scrollBy.mock.calls[0]![1]).toBeLessThan(0);
    scrollBy.mockRestore();
  });

  it("does not auto-scroll for a drag-over in the middle of the viewport", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    stubBlockRects();
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    window.dispatchEvent(dragOver(Math.floor(window.innerHeight / 2)));
    expect(scrollBy).not.toHaveBeenCalled();
    scrollBy.mockRestore();
  });

  it("reports index 0 for a drag-over above the first block's midpoint", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    stubBlockRects();
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    window.dispatchEvent(dragOver(10));
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cmssy:drag-index", index: 0 }),
      editorOrigin,
    );
    scrollBy.mockRestore();
  });

  it("posts cmssy:move for a block reorder drag", () => {
    const { container } = render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    stubBlockRects();
    const b1El = container.querySelector('[data-block-id="b1"]')!;
    const { make } = dropEvent(150, null);
    document.dispatchEvent(make("dragstart", b1El)); // start dragging b1
    document.dispatchEvent(make("drop")); // drop below b2 → index 2
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "cmssy:move",
        blockId: "b1",
        index: 2,
      }),
      editorOrigin,
    );
  });

  it("measures block rects once per drag and reuses them across drag-over messages", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    const counter = { n: 0 };
    stubBlockRectsCounting(counter);
    for (let i = 0; i < 5; i++) window.dispatchEvent(dragOver(150));
    expect(counter.n).toBe(2);
    expect(mockParent.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "cmssy:drag-index", index: 2 }),
      editorOrigin,
    );
  });

  it("keeps the drop index correct after an auto-scroll without re-measuring", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    const counter = { n: 0 };
    stubBlockRectsCounting(counter);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    window.dispatchEvent(dragOver(150));
    expect(counter.n).toBe(2);
    Object.defineProperty(window, "scrollY", {
      value: 100,
      configurable: true,
    });
    try {
      window.dispatchEvent(dragOver(50));
      expect(counter.n).toBe(2);
      expect(mockParent.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: "cmssy:drag-index", index: 2 }),
        editorOrigin,
      );
    } finally {
      Object.defineProperty(window, "scrollY", {
        value: 0,
        configurable: true,
      });
      scrollBy.mockRestore();
    }
  });

  it("re-measures block rects on a new drag after the previous one ends", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    const counter = { n: 0 };
    stubBlockRectsCounting(counter);
    window.dispatchEvent(dragOver(150));
    expect(counter.n).toBe(2);
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: editorOrigin,
        source: null,
        data: { type: "cmssy:drag-end", protocolVersion: PROTOCOL_VERSION },
      }),
    );
    window.dispatchEvent(dragOver(150));
    expect(counter.n).toBe(4);
  });

  it("ignores a native drop that is not a reorder (no drag started)", () => {
    render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
    stubBlockRects();
    const { make } = dropEvent(50, null);
    document.dispatchEvent(make("drop")); // no prior dragstart → movingId null
    const dragCalls = mockParent.postMessage.mock.calls.filter((c) =>
      ["cmssy:move", "cmssy:drag-index"].includes(
        (c[0] as { type?: string })?.type ?? "",
      ),
    );
    expect(dragCalls).toHaveLength(0);
  });
});
