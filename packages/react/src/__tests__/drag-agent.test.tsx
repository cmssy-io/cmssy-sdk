// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CmssyEditablePage } from "../components/editable-page";
import { registerComponent, clearRegistry } from "../registry";
import { fields } from "../fields";
import { PROTOCOL_VERSION } from "../bridge/protocol";

const editorOrigin = "https://editor.cmssy.io";

const Hero = ({ content }: { content: Record<string, unknown> }) => (
  <h1>{String(content.heading ?? "")}</h1>
);

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
    clearRegistry();
    registerComponent(Hero, {
      type: "hero",
      props: { heading: fields.singleLine() },
    });
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
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
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

  it("reports index 0 for a drag-over above the first block's midpoint", () => {
    render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    stubBlockRects();
    window.dispatchEvent(dragOver(10));
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cmssy:drag-index", index: 0 }),
      editorOrigin,
    );
  });

  it("posts cmssy:move for a block reorder drag", () => {
    const { container } = render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
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

  it("ignores a native drop that is not a reorder (no drag started)", () => {
    render(
      <CmssyEditablePage page={page} locale="en" edit={{ editorOrigin }} />,
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
