export interface TransformResult {
  code: string;
  changed: boolean;
  notes?: string[];
}

const HAND_TYPED_CONTENT =
  /content\s*:\s*(Record<string,\s*unknown>|\{[^}]*\}|[A-Z]\w*(Content|Props))/;

function stripTypeArguments(source: string): {
  code: string;
  changed: boolean;
} {
  const marker = "defineBlock<";
  let code = source;
  let changed = false;

  for (let start = code.indexOf(marker); start !== -1;) {
    const open = start + marker.length - 1;
    let depth = 0;
    let end = -1;

    for (let i = open; i < code.length; i++) {
      const char = code[i];
      if (char === "<") depth++;
      else if (char === ">") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      } else if (char === "(" || char === ";" || char === "\n") {
        break;
      }
    }

    if (end === -1) {
      start = code.indexOf(marker, start + marker.length);
      continue;
    }

    code = code.slice(0, open) + code.slice(end + 1);
    changed = true;
    start = code.indexOf(marker);
  }

  return { code, changed };
}

const INLINE_SCHEMA = /props\s*:\s*\{/;

export function transform(source: string): TransformResult {
  const { code, changed } = stripTypeArguments(source);

  const notes: string[] = [];
  const usesBlockProps = /\bBlockProps\s*</.test(code);

  if (/\bdefineBlock\s*\(/.test(code) && INLINE_SCHEMA.test(code)) {
    notes.push(
      "the schema is inline - export it, and type the component with BlockProps<typeof props>",
    );
  } else if (HAND_TYPED_CONTENT.test(code) && !usesBlockProps) {
    notes.push(
      "types a block's content by hand - derive it from the schema instead",
    );
  }

  return notes.length > 0 ? { code, changed, notes } : { code, changed };
}
