const TRANSPARENT = 0.01;

const PAINTS_WITHOUT_TEXT = "img,svg,video,canvas,picture,iframe";

export function effectiveOpacity(node: Element | null): number {
  let value = 1;
  let current: Element | null = node;
  while (current) {
    const style = getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return 0;
    const own = Number.parseFloat(style.opacity);
    if (Number.isFinite(own)) value *= own;
    if (value <= TRANSPARENT) return 0;
    if (current === document.documentElement) break;
    current = current.parentElement;
  }
  return value;
}

function paintsSomething(el: Element): boolean {
  if (el.matches(PAINTS_WITHOUT_TEXT)) return true;
  for (const node of el.childNodes) {
    if (node.nodeType === 3 && node.textContent?.trim()) return true;
  }
  return false;
}

export function isBlockPainted(block: Element): boolean {
  const candidates: Element[] = [];
  if (paintsSomething(block)) candidates.push(block);
  for (const el of block.querySelectorAll("*")) {
    if (paintsSomething(el)) candidates.push(el);
  }
  if (candidates.length === 0) return true;
  return candidates.some((el) => effectiveOpacity(el) > TRANSPARENT);
}
