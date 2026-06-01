// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { CmssyPage } from "../components/cmssy-page";
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
    render(<CmssyPage page={page} locale="en" edit={{ editorOrigin }} />);
    expect(mockParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "cmssy:ready",
        protocolVersion: PROTOCOL_VERSION,
        schemas: expect.objectContaining({ hero: expect.anything() }),
      }),
      editorOrigin,
    );
  });

  it("re-sends cmssy:ready on cmssy:parent-ready", async () => {
    render(<CmssyPage page={page} locale="en" edit={{ editorOrigin }} />);
    expect(mockParent.postMessage).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: editorOrigin,
          data: { type: "cmssy:parent-ready", protocolVersion: PROTOCOL_VERSION },
        }),
      );
    });
    expect(mockParent.postMessage).toHaveBeenCalledTimes(2);
  });

  it("live-patches a block on cmssy:patch, merging over the base content", async () => {
    const { container } = render(
      <CmssyPage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    expect(container.textContent).toContain("Hello|World");
    await act(async () => {
      window.dispatchEvent(patchEvent(editorOrigin, { heading: "Edited" }));
    });
    expect(container.textContent).toContain("Edited|World");
  });

  it("ignores a patch from a wrong origin", async () => {
    const { container } = render(
      <CmssyPage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    await act(async () => {
      window.dispatchEvent(patchEvent("https://evil.com", { heading: "Hacked" }));
    });
    expect(container.textContent).toContain("Hello|World");
    expect(container.textContent).not.toContain("Hacked");
  });

  it("ignores a patch whose source is not window.parent", async () => {
    const { container } = render(
      <CmssyPage page={page} locale="en" edit={{ editorOrigin }} />,
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
      <CmssyPage page={page} locale="en" edit={{ editorOrigin }} />,
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
      <CmssyPage page={pageA} locale="en" edit={{ editorOrigin }} />,
    );
    await act(async () => {
      window.dispatchEvent(patchEvent(editorOrigin, { heading: "Edited" }));
    });
    expect(container.textContent).toContain("Edited|1");
    await act(async () => {
      rerender(<CmssyPage page={pageB} locale="en" edit={{ editorOrigin }} />);
    });
    expect(container.textContent).toContain("B|2");
    expect(container.textContent).not.toContain("Edited");
  });

  it("does not post or accept patches when not framed (parent === self)", async () => {
    setParent(window);
    const postSpy = vi.spyOn(window, "postMessage");
    const { container } = render(
      <CmssyPage page={page} locale="en" edit={{ editorOrigin }} />,
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
      <CmssyPage page={page} locale="en" edit={{ editorOrigin: "not-an-origin" }} />,
    );
    expect(container.textContent).toContain("Hello|World");
    warn.mockRestore();
  });

  it("does not mount the bridge without edit config", () => {
    render(<CmssyPage page={page} locale="en" />);
    expect(mockParent.postMessage).not.toHaveBeenCalled();
  });
});
