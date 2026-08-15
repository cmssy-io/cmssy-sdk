// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import type { InvisibleBlock } from "@cmssy/core";
import { useInvisibleBlocks } from "../bridge/use-invisible-blocks";

type Entry = { target: Element; isIntersecting: boolean };

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  private readonly callback: (entries: Entry[]) => void;
  readonly targets: Element[] = [];

  constructor(callback: (entries: Entry[]) => void) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  disconnect() {
    this.targets.length = 0;
  }

  enter(target: Element) {
    this.callback([{ target, isIntersecting: true }]);
  }

  leave(target: Element) {
    this.callback([{ target, isIntersecting: false }]);
  }
}

const DWELL_MS = 1500;

function Probe({ report }: { report: (blocks: InvisibleBlock[]) => void }) {
  useInvisibleBlocks(true, "b1:hero", report);
  return null;
}

function blockMarkup(style: string) {
  const host = document.createElement("div");
  host.setAttribute("data-block-id", "b1");
  host.setAttribute("data-block-type", "hero");
  host.innerHTML = `<div style="${style}"><h1>Real tool</h1></div>`;
  document.body.appendChild(host);
  return host;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeIntersectionObserver.instances.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useInvisibleBlocks", () => {
  it("reports a block that has been in view and still paints nothing", () => {
    const block = blockMarkup("opacity:0");
    const report = vi.fn();
    render(<Probe report={report} />);

    const observer = FakeIntersectionObserver.instances[0]!;
    act(() => observer.enter(block));
    act(() => vi.advanceTimersByTime(DWELL_MS));

    expect(report).toHaveBeenCalledWith([{ blockId: "b1", blockType: "hero" }]);
  });

  it("says nothing about a block that never came into view", () => {
    blockMarkup("opacity:0");
    const report = vi.fn();
    render(<Probe report={report} />);

    act(() => vi.advanceTimersByTime(DWELL_MS * 4));

    expect(report).not.toHaveBeenCalled();
  });

  it("holds its judgement while the block is still animating in", () => {
    const block = blockMarkup("opacity:0");
    const report = vi.fn();
    render(<Probe report={report} />);

    const observer = FakeIntersectionObserver.instances[0]!;
    act(() => observer.enter(block));
    act(() => vi.advanceTimersByTime(DWELL_MS - 100));
    block.querySelector<HTMLElement>("div")!.style.opacity = "1";
    act(() => vi.advanceTimersByTime(200));

    expect(report).not.toHaveBeenCalled();
  });

  it("withdraws a report once the block paints", () => {
    const block = blockMarkup("opacity:0");
    const report = vi.fn();
    render(<Probe report={report} />);

    const observer = FakeIntersectionObserver.instances[0]!;
    act(() => observer.enter(block));
    act(() => vi.advanceTimersByTime(DWELL_MS));
    expect(report).toHaveBeenLastCalledWith([
      { blockId: "b1", blockType: "hero" },
    ]);

    block.querySelector<HTMLElement>("div")!.style.opacity = "1";
    act(() => vi.advanceTimersByTime(2000));

    expect(report).toHaveBeenLastCalledWith([]);
  });

  it("drops the timer when the block leaves the viewport before it settles", () => {
    const block = blockMarkup("opacity:0");
    const report = vi.fn();
    render(<Probe report={report} />);

    const observer = FakeIntersectionObserver.instances[0]!;
    act(() => observer.enter(block));
    act(() => vi.advanceTimersByTime(DWELL_MS - 100));
    act(() => observer.leave(block));
    act(() => vi.advanceTimersByTime(DWELL_MS));

    expect(report).not.toHaveBeenCalled();
  });
});
