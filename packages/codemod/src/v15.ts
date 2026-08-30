import type { TransformResult } from "./v8";

const SLOT_COMPONENTS = [
  "CmssyLayoutSlot",
  "CmssyServerLayout",
  "CmssyEditableLayout",
  "CmssyLazyLayout",
];

function renameSlotAttribute(source: string, component: string): string {
  const tag = new RegExp(`<${component}\\b[^>]*`, "g");
  return source.replace(tag, (match) =>
    match.replace(/\bposition(?==)/g, "region"),
  );
}

export function transform(source: string): TransformResult {
  let code = source.replace(/\blayoutPositions\b/g, "layoutRegions");

  for (const component of SLOT_COMPONENTS) {
    code = renameSlotAttribute(code, component);
  }

  return { code, changed: code !== source };
}
