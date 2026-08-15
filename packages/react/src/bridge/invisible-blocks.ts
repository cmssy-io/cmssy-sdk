const TRANSPARENT = 0.01;

const VISIBLE_TEXT_FRACTION = 0.5;

const MEDIA = "img,svg,video,canvas,picture,iframe";

const UNPAINTED_TEXT = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

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

export function isBlockPainted(block: Element): boolean {
  const copy = collectCopy(block);
  if (copy.length > 0) {
    const visible = copy.filter((el) => effectiveOpacity(el) > TRANSPARENT);
    return visible.length >= copy.length * VISIBLE_TEXT_FRACTION;
  }
  const media = collectMedia(block);
  if (media.length === 0) return true;
  return media.some((el) => effectiveOpacity(el) > TRANSPARENT);
}
