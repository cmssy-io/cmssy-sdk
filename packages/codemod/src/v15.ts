import type { TransformResult } from "./v8";

const SLOT_COMPONENTS = [
  "CmssyLayoutSlot",
  "CmssyServerLayout",
  "CmssyEditableLayout",
  "CmssyLazyLayout",
];

function renameSlotAttributes(source: string, component: string): string {
  const open = new RegExp(`<${component}\\b`, "g");
  let out = "";
  let last = 0;
  for (let m = open.exec(source); m !== null; m = open.exec(source)) {
    let i = m.index;
    let depth = 0;
    let quote: string | null = null;
    let tag = "";
    while (i < source.length) {
      const ch = source[i] as string;
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
      } else if (depth === 0) {
        if (ch === ">") break;
        if (
          source.startsWith("position=", i) &&
          !/[\w$]/.test(source[i - 1] ?? "")
        ) {
          tag += "region=";
          i += "position=".length;
          continue;
        }
      }
      tag += ch;
      i += 1;
    }
    out += source.slice(last, m.index) + tag;
    last = i;
    open.lastIndex = i;
  }
  return out + source.slice(last);
}

export function transform(source: string): TransformResult {
  let code = source.replace(/\blayoutPositions\b/g, "layoutRegions");

  for (const component of SLOT_COMPONENTS) {
    code = renameSlotAttributes(code, component);
  }

  return { code, changed: code !== source };
}
