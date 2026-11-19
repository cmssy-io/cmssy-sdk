// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import {
  effectiveOpacity,
  blockPaint,
  isAnimatingIn,
} from "../bridge/invisible-blocks";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  const block = document.querySelector<HTMLElement>("[data-block-id]");
  if (!block) throw new Error("the fixture has no block");
  return block;
}

afterEach(() => {
  document.body.innerHTML = "";
});

const clientRects = Range.prototype.getClientRects;

afterEach(() => {
  Range.prototype.getClientRects = clientRects;
});

function size(sizes: Record<string, [number, number]>) {
  Range.prototype.getClientRects = function (this: Range) {
    const holder = this.startContainer.parentElement;
    const match = Object.entries(sizes).find(([selector]) =>
      holder?.matches(selector),
    );
    const rects = match ? [new DOMRect(0, 0, match[1][0], match[1][1])] : [];
    return rects as unknown as DOMRectList;
  };
}

describe("blockPaint", () => {
  it("calls a block invisible when its only text sits under a transparent wrapper", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <div style="opacity:0;transform:translateY(12px)"><h1>Real tool</h1></div>
       </div>`,
    );
    expect(blockPaint(block)).toBe("transparent");
  });

  it("calls the same block painted once the wrapper reaches full opacity", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <div style="opacity:1"><h1>Real tool</h1></div>
       </div>`,
    );
    expect(blockPaint(block)).toBe("painted");
  });

  it("reads a block as painted when half its copy shows", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <div style="opacity:0"><h1>Hidden headline</h1></div>
         <p>Visible paragraph</p>
       </div>`,
    );
    expect(blockPaint(block)).toBe("painted");
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
    expect(blockPaint(block)).toBe("transparent");
  });

  it("reads a hero as painted when its headline shows and most of its small labels wait at opacity 0", () => {
    const block = mount(
      `<section data-block-id="b1" data-block-type="hero">
         <h1>Content and a store your agent can run.</h1>
         <a class="cta">Try it free</a>
         <div class="admin" style="opacity:0">
           <span class="label">Pages</span><span class="label">Products</span>
           <span class="label">Models</span><span class="label">Media</span>
           <span class="label">3 variants</span><span class="label">$349</span>
         </div>
         <div class="toast" style="opacity:0"><span class="label">Saved</span></div>
       </section>`,
    );
    size({ h1: [900, 160], ".cta": [140, 44], ".label": [60, 16] });
    expect(
      blockPaint(block),
      "2 of 9 text nodes paint, but they are most of the copy on screen; decorative labels staged for a scene are not an entry animation that never ran",
    ).toBe("painted");
  });

  it("weighs a paragraph's own words apart from the hidden span inside it", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <p>Hi <span style="opacity:0">a long sentence that has not faded in yet</span></p>
       </div>`,
    );
    size({ p: [20, 20], span: [400, 20] });
    expect(
      blockPaint(block),
      "the paragraph's box covers its hidden span; only the text it paints itself may count for it",
    ).toBe("transparent");
  });

  it("still calls a laid-out block invisible when only a long footnote survives", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="comparison-table">
         <div style="opacity:0">
           <h2>Headline</h2><p>One</p><p>Two</p><p>Three</p><p>Four</p>
         </div>
         <p class="note">Comparison reflects standard plans</p>
       </div>`,
    );
    size({ h2: [800, 60], "div[style] p": [800, 120], ".note": [300, 14] });
    expect(blockPaint(block)).toBe("transparent");
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
    expect(blockPaint(block)).toBe("transparent");
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
    expect(blockPaint(block)).toBe("painted");
  });

  it("still judges a block that has no copy on its media", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="gallery">
         <img alt="" src="a.png" />
       </div>`,
    );
    expect(blockPaint(block)).toBe("painted");
  });

  it("treats visibility:hidden the same as full transparency", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <div style="visibility:hidden"><h1>Real tool</h1></div>
       </div>`,
    );
    expect(blockPaint(block)).toBe("transparent");
  });

  it("counts media, not only text", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="gallery">
         <div style="opacity:0"><img alt="" src="x.png" /></div>
       </div>`,
    );
    expect(blockPaint(block)).toBe("transparent");
  });

  it("leaves a block with nothing to paint alone", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="spacer">
         <div style="opacity:0"></div>
       </div>`,
    );
    expect(blockPaint(block)).toBe("painted");
  });

  it("does not call a merely faded block invisible", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="hero">
         <div style="opacity:0.5"><h1>Real tool</h1></div>
       </div>`,
    );
    expect(blockPaint(block)).toBe("painted");
  });

  it("does not count copy that the viewport hides with display:none", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="header">
         <a href="/">cmssy</a>
         <nav style="display:none">
           <a href="/docs">Docs</a><a href="/pricing">Pricing</a><a href="/blog">Blog</a>
           <a href="/changelog">Changelog</a><a href="/about">About</a>
           <a href="/contact">Contact</a><a href="/login">Log in</a>
         </nav>
         <button>Menu</button>
       </div>`,
    );
    expect(
      blockPaint(block),
      "a responsive header hides its desktop links on a phone; copy that is not laid out is not an animation that never ran",
    ).toBe("painted");
  });

  it("ignores an unrun animation inside a drawer that is display:none", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="header">
         <a href="/">cmssy</a>
         <div style="display:none">
           <div style="opacity:0"><a href="/docs">Docs</a><a href="/pricing">Pricing</a><a href="/blog">Blog</a></div>
         </div>
       </div>`,
    );
    expect(
      blockPaint(block),
      "opacity:0 under a display:none ancestor is not painted anyway; counting it flags every closed mobile menu",
    ).toBe("painted");
  });

  it("leaves a block alone when this viewport lays out none of its copy", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="sidebar">
         <aside style="display:none"><h2>Related</h2><p>Links</p></aside>
       </div>`,
    );
    expect(blockPaint(block)).toBe("painted");
  });

  it("judges media the viewport hides the same way as copy", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="gallery">
         <img alt="" src="desktop.png" style="display:none" />
       </div>`,
    );
    expect(
      blockPaint(block),
      "an image the viewport does not lay out is not a candidate; with nothing laid out there is nothing to paint",
    ).toBe("painted");
  });

  it("still calls media invisible when the laid-out one is transparent", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="gallery">
         <img alt="" src="desktop.png" style="display:none" />
         <div style="opacity:0"><img alt="" src="mobile.png" /></div>
       </div>`,
    );
    expect(blockPaint(block)).toBe("transparent");
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

describe("a block that rendered nothing", () => {
  it("is invisible, not painted - an empty wrapper used to vouch for itself", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="product-grid"></div>`,
    );
    expect(blockPaint(block)).toBe("empty");
  });

  it("stays painted when it is empty on purpose but occupies space", () => {
    const block = mount(
      `<div data-block-id="b1" data-block-type="spacer"></div>`,
    );
    block.getBoundingClientRect = () => ({ width: 800, height: 48 }) as DOMRect;
    expect(blockPaint(block)).toBe("painted");
  });
});

describe("isAnimatingIn", () => {
  function withAnimations(animations: Animation[]): HTMLElement {
    const block = mount(`<div data-block-id="b1" data-block-type="hero"></div>`);
    (block as HTMLElement & { getAnimations: () => Animation[] }).getAnimations =
      () => animations;
    return block;
  }

  function animation(endTime: number, playState: AnimationPlayState = "running") {
    return {
      playState,
      effect: { getComputedTiming: () => ({ endTime }) },
    } as unknown as Animation;
  }

  it("holds a block while an animation that will end is running", () => {
    expect(isAnimatingIn(withAnimations([animation(600)]))).toBe(true);
  });

  it("ignores endless animations, which never settle", () => {
    expect(
      isAnimatingIn(withAnimations([animation(Number.POSITIVE_INFINITY)])),
    ).toBe(false);
  });

  it("ignores paused and finished animations", () => {
    expect(
      isAnimatingIn(
        withAnimations([animation(600, "paused"), animation(600, "finished")]),
      ),
    ).toBe(false);
  });

  it("reads nothing as animating where the browser has no getAnimations", () => {
    const block = mount(`<div data-block-id="b1" data-block-type="hero"></div>`);
    expect(isAnimatingIn(block)).toBe(false);
  });
});
