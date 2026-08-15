// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { effectiveOpacity, isBlockPainted } from "../bridge/invisible-blocks";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  const block = document.querySelector<HTMLElement>("[data-block-id]");
  if (!block) throw new Error("the fixture has no block");
  return block;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isBlockPainted", () => {
  it("calls a block invisible when its only text sits under a transparent wrapper", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <div style="opacity:0;transform:translateY(12px)"><h1>Real tool</h1></div>
       </div>`,
    );
    expect(isBlockPainted(block)).toBe(false);
  });

  it("calls the same block painted once the wrapper reaches full opacity", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <div style="opacity:1"><h1>Real tool</h1></div>
       </div>`,
    );
    expect(isBlockPainted(block)).toBe(true);
  });

  it("reads a block as painted when half its copy shows", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <div style="opacity:0"><h1>Hidden headline</h1></div>
         <p>Visible paragraph</p>
       </div>`,
    );
    expect(isBlockPainted(block)).toBe(true);
  });

  it("calls a block invisible when one stray node survives and the rest of the copy does not", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="comparison-table">
         <div style="opacity:0">
           <h2>Headline</h2><p>One</p><p>Two</p><p>Three</p><p>Four</p>
         </div>
         <p>Comparison reflects standard plans</p>
       </div>`,
    );
    expect(isBlockPainted(block)).toBe(false);
  });

  it("does not let a decorative svg vouch for copy that is gone", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <svg>
           <text>FIG 0.1</text><text>MCP</text><text>BLOCK - HERO</text>
           <text>update_block_content</text><text>AI-NATIVE HEADLESS</text>
         </svg>
         <div style="opacity:0"><h1>Real tool</h1><p>Decide in ten seconds</p></div>
       </div>`,
    );
    expect(isBlockPainted(block)).toBe(false);
  });

  it("does not count text that never paints as copy", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <script type="application/ld+json">{"@type":"Product"}</script>
         <script type="application/ld+json">{"@type":"Organization"}</script>
         <style>.hero{color:red}</style>
         <style>.hero h1{margin:0}</style>
         <template><p>Row</p></template>
         <h1>Real tool</h1>
         <p>Decide in ten seconds</p>
       </div>`,
    );
    expect(isBlockPainted(block)).toBe(true);
  });

  it("still judges a block that has no copy on its media", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="gallery">
         <img alt="" src="a.png" />
       </div>`,
    );
    expect(isBlockPainted(block)).toBe(true);
  });

  it("treats visibility:hidden the same as full transparency", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <div style="visibility:hidden"><h1>Real tool</h1></div>
       </div>`,
    );
    expect(isBlockPainted(block)).toBe(false);
  });

  it("counts media, not only text", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="gallery">
         <div style="opacity:0"><img alt="" src="x.png" /></div>
       </div>`,
    );
    expect(isBlockPainted(block)).toBe(false);
  });

  it("leaves a block with nothing to paint alone", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="spacer">
         <div style="opacity:0"></div>
       </div>`,
    );
    expect(isBlockPainted(block)).toBe(true);
  });

  it("does not call a merely faded block invisible", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <div style="opacity:0.5"><h1>Real tool</h1></div>
       </div>`,
    );
    expect(isBlockPainted(block)).toBe(true);
  });

  it("multiplies opacity down the ancestor chain", () => {
    mount(
      `<div data-block-id="b1" data-block-type="hero" style="opacity:0.02">
         <div style="opacity:0.02"><h1 id="t">Real tool</h1></div>
       </div>`,
    );
    expect(effectiveOpacity(document.getElementById("t"))).toBe(0);
  });
});
