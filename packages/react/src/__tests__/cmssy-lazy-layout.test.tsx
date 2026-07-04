// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { CmssyLazyLayout } from "../components/cmssy-lazy-layout";
import { defineBlock } from "../registry";
import { fields } from "../fields";

const editorOrigin = "https://editor.cmssy.io";

const Header = ({ content }: { content: Record<string, unknown> }) => (
  <header>{String(content.brand ?? "")}</header>
);

const blocks = [
  defineBlock({
    type: "site-header",
    label: "Header",
    component: Header,
    layoutPositions: ["header"],
    props: { brand: fields.text() },
  }),
];

const groups = [
  {
    position: "header",
    blocks: [
      {
        id: "h1",
        type: "site-header",
        content: { en: { brand: "Acme" } },
        order: 0,
        isActive: true,
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

describe("CmssyLazyLayout", () => {
  beforeEach(() => {
    cleanup();
    mockParent = { postMessage: vi.fn() };
    setParent(mockParent);
  });

  afterEach(() => {
    setParent(window);
  });

  it("renders nothing until blocks resolve, then renders the layout", async () => {
    const load = vi.fn(() => Promise.resolve({ blocks }));
    const { container } = render(
      <CmssyLazyLayout
        groups={groups}
        position="header"
        locale="en"
        edit={{ editorOrigin }}
        load={load}
      />,
    );
    expect(container.textContent).toBe("");
    await waitFor(() => expect(container.textContent).toContain("Acme"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("renders nothing and logs when load() rejects", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <CmssyLazyLayout
        groups={groups}
        position="header"
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
      <CmssyLazyLayout
        groups={groups}
        position="header"
        edit={{ editorOrigin }}
        load={() => Promise.resolve({ blocks: undefined as unknown as never })}
      />,
    );
    await waitFor(() => expect(err).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    err.mockRestore();
  });

  it("reloads when the load callback changes", async () => {
    const load1 = vi.fn(() => Promise.resolve({ blocks }));
    const { container, rerender } = render(
      <CmssyLazyLayout
        groups={groups}
        position="header"
        edit={{ editorOrigin }}
        load={load1}
      />,
    );
    await waitFor(() => expect(container.textContent).toContain("Acme"));
    const load2 = vi.fn(() => Promise.resolve({ blocks }));
    rerender(
      <CmssyLazyLayout
        groups={groups}
        position="header"
        edit={{ editorOrigin }}
        load={load2}
      />,
    );
    await waitFor(() => expect(load2).toHaveBeenCalledTimes(1));
  });
});
