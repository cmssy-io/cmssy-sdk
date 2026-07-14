/**
 * 8.0 types a block's `content` from its field schema.
 *
 * Only one part of that migration is mechanical: `defineBlock<Content, Data>`
 * no longer takes explicit type arguments, because both are inferred. The rest -
 * retyping a component as `BlockProps<typeof props>` - is NOT rewritten here,
 * and deliberately so: a hand-written content type is the very thing that had
 * drifted from the schema, and a codemod that "fixes" it by copying the drift
 * forward would launder the bug instead of surfacing it.
 *
 * So this transform reports what it will not touch. A file it names still has
 * two sources of truth about its fields until a human looks at it.
 */
export interface TransformResult {
  code: string;
  changed: boolean;
  /** Things a human must do in this file. Printed by the CLI, never silent. */
  notes?: string[];
}

const HAND_TYPED_CONTENT =
  /content\s*:\s*(Record<string,\s*unknown>|\{[^}]*\}|[A-Z]\w*(Content|Props))/;

/** `defineBlock<A, B<C>>(` → `defineBlock(`, counting angle brackets. */
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
        // Not a type-argument list after all - do not eat the file.
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

/**
 * A schema written straight into the `defineBlock` call, rather than declared
 * where the component can be typed from it. `props: heroProps` is the migrated
 * shape and must not be flagged - a codemod that keeps nagging about correct
 * code teaches people to ignore it.
 */
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
