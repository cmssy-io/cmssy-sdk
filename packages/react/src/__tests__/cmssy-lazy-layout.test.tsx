// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { CmssyLazyLayout } from "../components/cmssy-lazy-layout";
import { defineBlock, type BlockProps } from "../registry";
import { fields } from "@cmssy/core";

const editorOrigin = "https://editor.cmssy.io";

const headerProps = { brand: fields.text() };

const Header = ({ content }: BlockProps<typeof headerProps>) => (
  <header>{content.brand ?? ""}</header>
);

const blocks = [
  defineBlock({
    type: "site-header",
    label: "Header",
    component: Header,
    layoutPositions: ["header"],
    props: headerProps,
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

describe("editor-content marker", () => {
  it("reports how many blocks the editor actually got", async () => {
    const { container } = render(
      <CmssyLazyLayout
        groups={groups}
        position="header"
        locale="en"
        defaultLocale="en"
        edit={{ editorOrigin }}
        resolvedContent={{ h1: { brand: "Acme" } }}
        load={async () => ({ blocks })}
      />,
    );

    const marker = container.querySelector("[data-cmssy-layout-slot]");
    expect(marker?.getAttribute("data-cmssy-editor-content")).toBe("1");
  });

  it("reports zero when the slot rendered outside edit mode", async () => {
    const { container } = render(
      <CmssyLazyLayout
        groups={groups}
        position="header"
        locale="en"
        defaultLocale="en"
        edit={{ editorOrigin }}
        load={async () => ({ blocks })}
      />,
    );

    // The mounted-slot marker alone says nothing: it is here either way. Zero
    // is what an adapter looks like when its edit signal never arrived - the
    // state that shipped undetected because only the marker was asserted.
    const marker = container.querySelector("[data-cmssy-layout-slot]");
    expect(marker).not.toBeNull();
    expect(marker?.getAttribute("data-cmssy-editor-content")).toBe("0");
  });
});
