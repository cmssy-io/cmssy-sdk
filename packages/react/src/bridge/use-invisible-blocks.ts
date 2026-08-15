import { useEffect, useRef } from "react";
import type { InvisibleBlock } from "@cmssy/core";
import { isBlockPainted } from "./invisible-blocks";

const DWELL_MS = 1500;
const VISIBLE_FRACTION = 0.35;
const SWEEP_MS = 2000;

export function useInvisibleBlocks(
  enabled: boolean,
  blocksKey: string,
  report: (blocks: InvisibleBlock[]) => void,
): void {
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;
    if (typeof IntersectionObserver === "undefined") return;

    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const observed = new WeakSet<Element>();
    const invisible = new Map<string, InvisibleBlock>();
    let reported = "";

    const flush = () => {
      const blocks = [...invisible.values()];
      const key = blocks
        .map((block) => `${block.blockId}:${block.blockType}`)
        .sort()
        .join("|");
      if (key === reported) return;
      reported = key;
      reportRef.current(blocks);
    };

    const judge = (el: Element) => {
      const blockId = el.getAttribute("data-block-id");
      const blockType = el.getAttribute("data-block-type");
      if (!blockId || !blockType) return;
      if (isBlockPainted(el)) invisible.delete(blockId);
      else invisible.set(blockId, { blockId, blockType });
      flush();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pending = timers.get(entry.target);
          if (
            !entry.isIntersecting ||
            entry.intersectionRatio < VISIBLE_FRACTION
          ) {
            if (pending) {
              clearTimeout(pending);
              timers.delete(entry.target);
            }
            continue;
          }
          if (pending) continue;
          timers.set(
            entry.target,
            setTimeout(() => {
              timers.delete(entry.target);
              judge(entry.target);
            }, DWELL_MS),
          );
        }
      },
      { threshold: VISIBLE_FRACTION },
    );

    const sweep = () => {
      const present = new Set<string>();
      for (const el of document.querySelectorAll("[data-block-id]")) {
        if (!observed.has(el)) {
          observed.add(el);
          observer.observe(el);
        }
        const blockId = el.getAttribute("data-block-id");
        if (!blockId) continue;
        present.add(blockId);
        if (invisible.has(blockId) && isBlockPainted(el)) {
          invisible.delete(blockId);
        }
      }
      for (const blockId of [...invisible.keys()]) {
        if (!present.has(blockId)) invisible.delete(blockId);
      }
      flush();
    };

    sweep();
    const interval = setInterval(sweep, SWEEP_MS);

    return () => {
      observer.disconnect();
      for (const timer of timers.values()) clearTimeout(timer);
      clearInterval(interval);
    };
  }, [enabled, blocksKey]);
}
