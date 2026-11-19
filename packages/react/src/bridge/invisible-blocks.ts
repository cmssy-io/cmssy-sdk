import type { InvisibleReason } from "@cmssy/core";

const TRANSPARENT = 0.01;

const VISIBLE_TEXT_FRACTION = 0.5;

const MEDIA = "img,svg,video,canvas,picture,iframe";

const UNPAINTED_TEXT = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

interface Paint {
  laidOut: boolean;
  opacity: number;
}

const NOT_LAID_OUT: Paint = { laidOut: false, opacity: 0 };

function paint(node: Element | null): Paint {
  let opacity = 1;
  let current: Element | null = node;
  while (current) {
    const style = getComputedStyle(current);
    if (style.display === "none") return NOT_LAID_OUT;
    if (style.visibility === "hidden") opacity = 0;
    const own = Number.parseFloat(style.opacity);
    if (Number.isFinite(own)) opacity *= own;
    if (current === document.documentElement) break;
    current = current.parentElement;
  }
  return { laidOut: true, opacity: opacity <= TRANSPARENT ? 0 : opacity };
}

export function effectiveOpacity(node: Element | null): number {
  return paint(node).opacity;
}

function holdsText(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === 3 && node.textContent?.trim()) return true;
  }
  return false;
}

function collectCopy(block: Element): Element[] {
  const copy: Element[] = [];
  const keep = (el: Element) => {
    if (UNPAINTED_TEXT.has(el.tagName)) return;
    if (el.closest("svg")) return;
    if (holdsText(el)) copy.push(el);
  };
  keep(block);
  for (const el of block.querySelectorAll("*")) keep(el);
  return copy;
}

function collectMedia(block: Element): Element[] {
  const media: Element[] = [];
  if (block.matches(MEDIA)) media.push(block);
  for (const el of block.querySelectorAll(MEDIA)) media.push(el);
  return media;
}

function laidOut(elements: Element[]): Paint[] {
  return elements.map(paint).filter((state) => state.laidOut);
}

function area(el: Element): number {
  const rect = el.getBoundingClientRect();
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function visibleCopyShare(copy: Element[]): number | null {
  const states = copy
    .map((el) => ({ paint: paint(el), area: area(el) }))
    .filter((state) => state.paint.laidOut);
  if (states.length === 0) return null;
  const total = states.reduce((sum, state) => sum + state.area, 0);
  const weight = (state: { area: number }) => (total > 0 ? state.area : 1);
  const visible = states
    .filter((state) => state.paint.opacity > TRANSPARENT)
    .reduce((sum, state) => sum + weight(state), 0);
  return visible / (total > 0 ? total : states.length);
}

function hasArea(block: Element): boolean {
  const rect = block.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export type BlockPaint = "painted" | InvisibleReason;

export function blockPaint(block: Element): BlockPaint {
  if (block.childElementCount === 0 && !holdsText(block) && !hasArea(block)) {
    return "empty";
  }
  const share = visibleCopyShare(collectCopy(block));
  if (share !== null) {
    return share >= VISIBLE_TEXT_FRACTION ? "painted" : "transparent";
  }
  const media = laidOut(collectMedia(block));
  if (media.length === 0) return "painted";
  return media.some((state) => state.opacity > TRANSPARENT)
    ? "painted"
    : "transparent";
}

function settles(animation: Animation): boolean {
  if (animation.playState !== "running") return false;
  const end = animation.effect?.getComputedTiming().endTime;
  return typeof end === "number" && Number.isFinite(end);
}

export function isAnimatingIn(block: Element): boolean {
  if (typeof block.getAnimations !== "function") return false;
  return block.getAnimations({ subtree: true }).some(settles);
}
