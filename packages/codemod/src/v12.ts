import type { TransformResult } from "./v8";

const MEDIA_FIELD = /\bfields\s*\.\s*media\s*\(/;

const DIRECT_USE = [
  /\bsrc\s*=\s*\{\s*content\.(\w+)\s*\}/g,
  /\bsrc\s*=\s*\{\s*(\w+)\.(\w+)\s*\}/g,
  /\bbackgroundImage\s*:\s*`url\(\$\{\s*content\.(\w+)\s*\}\)`/g,
];

function collectDirectUses(source: string): string[] {
  const found = new Set<string>();

  for (const pattern of DIRECT_USE) {
    pattern.lastIndex = 0;
    for (
      let match = pattern.exec(source);
      match !== null;
      match = pattern.exec(source)
    ) {
      found.add(match[0].trim());
    }
  }

  return [...found];
}

export function transform(source: string): TransformResult {
  if (!MEDIA_FIELD.test(source)) {
    return { code: source, changed: false };
  }

  const notes = [
    "A media value is no longer the asset's URL. It reads back as { id, url, visibility, alt?, width?, height? } and url is null for a private asset.",
    "Replace `src={content.image}` with `src={content.image.url}`, and guard it: a reference whose asset was deleted resolves to null.",
    "A gallery is an array of the same object, so `content.gallery.map((one) => one.url)`.",
    "alt now arrives with the value for the locale being read - pass it to the img rather than writing your own.",
  ];

  const uses = collectDirectUses(source);
  if (uses.length > 0) {
    notes.push(
      `Direct uses to check by hand: ${uses.slice(0, 8).join(", ")}${uses.length > 8 ? ` (+${uses.length - 8} more)` : ""}`,
    );
  }

  return { code: source, changed: false, notes };
}
