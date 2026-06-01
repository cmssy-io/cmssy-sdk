// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
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
) {
  return new MessageEvent("message", {
    origin,
    data: {
      type: "cmssy:patch",
      blockId,
      content,
      protocolVersion: PROTOCOL_VERSION,
    },
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
  });

  it("posts cmssy:ready (with schemas) on mount", () => {
    const postSpy = vi.spyOn(window.parent, "postMessage");
    render(<CmssyPage page={page} locale="en" edit={{ editorOrigin }} />);
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "cmssy:ready",
        protocolVersion: PROTOCOL_VERSION,
        schemas: expect.objectContaining({ hero: expect.anything() }),
      }),
      editorOrigin,
    );
    postSpy.mockRestore();
  });

  it("live-patches a block on cmssy:patch, merging over the base content", async () => {
    const { container } = render(
      <CmssyPage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    expect(container.textContent).toContain("Hello|World");
    await act(async () => {
      window.dispatchEvent(patchEvent(editorOrigin, { heading: "Edited" }));
    });
    // heading patched, sub preserved from base (partial patch merged)
    expect(container.textContent).toContain("Edited|World");
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

  it("ignores a patch from a wrong origin", async () => {
    const { container } = render(
      <CmssyPage page={page} locale="en" edit={{ editorOrigin }} />,
    );
    await act(async () => {
      window.dispatchEvent(patchEvent("https://evil.com", { heading: "Hacked" }));
    });
    expect(container.textContent).toContain("Hello");
    expect(container.textContent).not.toContain("Hacked");
  });

  it("does not crash the host when editorOrigin is invalid", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(
      <CmssyPage page={page} locale="en" edit={{ editorOrigin: "not-an-origin" }} />,
    );
    expect(container.textContent).toContain("Hello|World");
    warn.mockRestore();
  });

  it("does not mount the bridge without edit config", () => {
    const postSpy = vi.spyOn(window.parent, "postMessage");
    render(<CmssyPage page={page} locale="en" />);
    expect(postSpy).not.toHaveBeenCalled();
    postSpy.mockRestore();
  });
});
