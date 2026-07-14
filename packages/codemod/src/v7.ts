/**
 * 7.0 renames one export. `CmssyChrome` came from the UI-jargon sense of
 * "chrome" - the frame around the content. In a CMS SDK that reads as the
 * browser, and the thing it actually renders is a layout slot: the header or
 * footer blocks at a named position.
 */
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
