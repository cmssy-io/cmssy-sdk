// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { CmssyLazyEditor } from "../components/cmssy-lazy-editor";
import { defineBlock } from "../registry";
import { fields } from "@cmssy/core";

const editorOrigin = "https://editor.cmssy.io";

const Hero = ({ content }: { content: Record<string, unknown> }) => (
  <h1>{String(content.heading ?? "")}</h1>
);

const blocks = [
  defineBlock({
    type: "hero",
    label: "Hero",
    component: Hero,
    props: { heading: fields.text() },
  }),
];

const page = {
  id: "p",
  blocks: [{ id: "b1", type: "hero", content: { en: { heading: "Hello" } } }],
};

let mockParent: { postMessage: ReturnType<typeof vi.fn> };

function setParent(value: unknown) {
  Object.defineProperty(window, "parent", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("CmssyLazyEditor", () => {
  beforeEach(() => {
    cleanup();
    mockParent = { postMessage: vi.fn() };
    setParent(mockParent);
  });

  afterEach(() => {
    setParent(window);
  });

  it("renders nothing until the blocks resolve, then renders them", async () => {
    const load = vi.fn(() =>
      Promise.resolve({ blocks, category: "kancelaria" }),
    );
    const { container } = render(
      <CmssyLazyEditor
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        load={load}
      />,
    );
    expect(container.textContent).toBe("");
    await waitFor(() => expect(container.textContent).toContain("Hello"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("renders nothing and logs when load() rejects", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <CmssyLazyEditor
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        load={() => Promise.reject(new Error("boom"))}
      />,
    );
    await waitFor(() => expect(err).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    err.mockRestore();
  });

  it("renders nothing and logs when load() resolves a non-array blocks", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <CmssyLazyEditor
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        load={() => Promise.resolve({ blocks: undefined as unknown as never })}
      />,
    );
    await waitFor(() => expect(err).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    err.mockRestore();
  });

  it("reloads when the load callback changes (no stale blocks)", async () => {
    const load1 = vi.fn(() => Promise.resolve({ blocks, category: "a" }));
    const { container, rerender } = render(
      <CmssyLazyEditor
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        load={load1}
      />,
    );
    await waitFor(() => expect(container.textContent).toContain("Hello"));
    const load2 = vi.fn(() => Promise.resolve({ blocks, category: "b" }));
    rerender(
      <CmssyLazyEditor
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        load={load2}
      />,
    );
    await waitFor(() => expect(load2).toHaveBeenCalledTimes(1));
  });

  it("posts cmssy:ready with the resolved category after load", async () => {
    render(
      <CmssyLazyEditor
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        load={() => Promise.resolve({ blocks, category: "kancelaria" })}
      />,
    );
    await waitFor(() => {
      const ready = mockParent.postMessage.mock.calls.find(
        (c) => (c[0] as { type?: string })?.type === "cmssy:ready",
      )?.[0] as { blockMeta: Record<string, unknown> } | undefined;
      expect(ready?.blockMeta.hero).toEqual({
        label: "Hero",
        category: "kancelaria",
      });
    });
  });
});
