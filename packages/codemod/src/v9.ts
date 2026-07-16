/**
 * 9.0 removes the config locale override: `defaultLocale` / `enabledLocales`
 * on `CmssyConfig` duplicated the workspace site config and were honored
 * inconsistently - the SEO helpers and the Next middleware read them, the
 * router never did. The workspace's languages are the only source of truth now.
 *
 * The removal itself is mechanical (the fields no longer exist, so leaving
 * them in is a type error), but it is reported: if the removed value disagreed
 * with the workspace, routing and SEO change, and only a human can confirm the
 * workspace languages are what the site expects.
 */
import type { TransformResult } from "./v8";

const KEYS = ["defaultLocale", "enabledLocales"] as const;

/**
 * The keys are common words (component props, CmssySiteLocales literals), so
 * they are only stripped inside a cmssy config literal: the argument of
 * `defineCmssyConfig(...)` or an object annotated `: CmssyConfig = {...}`.
 */
function configRegions(code: string): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = [];
  const openers = [/defineCmssyConfig\s*\(\s*\{/g, /:\s*CmssyConfig\s*=\s*\{/g];
  for (const opener of openers) {
    for (const match of code.matchAll(opener)) {
      const start = match.index + match[0].length - 1;
      let depth = 0;
      for (let i = start; i < code.length; i++) {
        if (code[i] === "{") depth++;
        else if (code[i] === "}") {
          depth--;
          if (depth === 0) {
            regions.push({ start, end: i });
            break;
          }
        }
      }
    }
  }
  return regions;
}

/** Removes `key: <value>,` from the slice, counting `[`/`{` in the value. */
function stripKey(
  slice: string,
  key: string,
): { code: string; removed: string | null } {
  const property = new RegExp(`(^|\\n)([ \\t]*)${key}\\s*:\\s*`);
  const match = property.exec(slice);
  if (!match) return { code: slice, removed: null };

  const valueStart = match.index + match[0].length;
  let i = valueStart;
  let square = 0;
  let curly = 0;
  for (; i < slice.length; i++) {
    const char = slice[i];
    if (char === "[") square++;
    else if (char === "]") square--;
    else if (char === "{") curly++;
    else if (char === "}") {
      if (curly === 0) break;
      curly--;
    } else if (char === "," && square === 0 && curly === 0) {
      i++;
      break;
    }
  }
  let end = i;
  if (slice[end] === "\n" || slice.startsWith("\r\n", end)) {
    end += slice[end] === "\r" ? 2 : 1;
  }
  const from = match.index + (match[1] ?? "").length;
  return {
    code: slice.slice(0, from) + slice.slice(end),
    removed: slice.slice(valueStart, i).trim().replace(/,$/, ""),
  };
}

export function transform(source: string): TransformResult {
  let code = source;
  const notes: string[] = [];

  // Regions are re-resolved after every removal - offsets shift.
  for (const key of KEYS) {
    let removed: string | null;
    do {
      removed = null;
      for (const { start, end } of configRegions(code)) {
        const slice = code.slice(start, end + 1);
        const result = stripKey(slice, key);
        if (result.removed !== null) {
          code = code.slice(0, start) + result.code + code.slice(end + 1);
          removed = result.removed;
          notes.push(
            `removed config.${key} (${removed}) - the workspace languages rule now; confirm Settings → Languages matches`,
          );
          break;
        }
      }
    } while (removed !== null);
  }

  const changed = code !== source;
  return notes.length > 0 ? { code, changed, notes } : { code, changed };
}
