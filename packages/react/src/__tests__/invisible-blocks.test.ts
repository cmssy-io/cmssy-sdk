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

  it("reads a block as painted when any one of its content nodes shows", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <div style="opacity:0"><h1>Hidden headline</h1></div>
         <p>Visible paragraph</p>
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
