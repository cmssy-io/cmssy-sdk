import type { TransformResult } from "./v8";

const MEDIA_FIELD = /(\w+)\s*:\s*fields\s*\.\s*media\s*\(/g;

function mediaFieldNames(source: string): string[] {
  const names = new Set<string>();
  MEDIA_FIELD.lastIndex = 0;
  for (
    let match = MEDIA_FIELD.exec(source);
    match !== null;
    match = MEDIA_FIELD.exec(source)
  ) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
}

function usesOf(source: string, field: string): string[] {
  const uses = new Set<string>();
  const reads = new RegExp(`\\b(\\w+)\\.${field}\\b`, "g");

  for (
    let match = reads.exec(source);
    match !== null;
    match = reads.exec(source)
  ) {
    const line = source.slice(
      source.lastIndexOf("\n", match.index) + 1,
      (source.indexOf("\n", match.index) + 1 || source.length + 1) - 1,
    );
    uses.add(line.trim());
  }

  return [...uses];
}

export function transform(source: string): TransformResult {
  const fields = mediaFieldNames(source);
  if (fields.length === 0) return { code: source, changed: false };

  const notes = [
    `Media fields in this file: ${fields.join(", ")}.`,
    "A media value is no longer the asset's URL. It reads back as { id, url, visibility, alt?, width?, height? }, and url is null for a private asset or one whose asset was deleted.",
    "So `src={content.image}` becomes `src={content.image.url}` behind a null check, and a gallery is `content.gallery.map((one) => one.url)`.",
    "alt arrives resolved for the locale being read - pass it to the img rather than writing your own.",
  ];

  for (const field of fields) {
    const lines = usesOf(source, field);
    if (lines.length > 0) {
      notes.push(`Lines reading "${field}": ${lines.join(" | ")}`);
    }
  }

  return { code: source, changed: false, notes };
}
