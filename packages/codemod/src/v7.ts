export const RENAMES: Record<string, string> = {
  CmssyChrome: "CmssyLayoutSlot",
  CmssyChromeProps: "CmssyLayoutSlotProps",
};

export interface TransformResult {
  code: string;
  changed: boolean;
}

export function transform(source: string): TransformResult {
  let code = source;
  let changed = false;

  for (const [from, to] of Object.entries(RENAMES)) {
    const pattern = new RegExp(`\\b${from}\\b`, "g");
    if (pattern.test(code)) {
      code = code.replace(pattern, to);
      changed = true;
    }
  }

  return { code, changed };
}
