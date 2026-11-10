import type { FieldDefinition } from "@cmssy/types";
import { bucketOf } from "./data/block-content";

export function unreachableShowWhenTargets(
  blockType: string,
  schema: Record<string, FieldDefinition>,
  path: readonly string[] = [],
): string[] {
  return Object.entries(schema).flatMap(([key, field]) => {
    const at = [...path, key].join(".");
    const own = field.showWhen
      ? unreachable(schema, key, field, path.length === 0)
      : null;
    const problems = own
      ? [
          `cmssy: block "${blockType}" field "${at}" has showWhen on ${JSON.stringify(field.showWhen?.field)}, ${own}`,
        ]
      : [];
    const nested = field.itemSchema
      ? unreachableShowWhenTargets(blockType, field.itemSchema, [...path, key])
      : [];
    return [...problems, ...nested];
  });
}

function unreachable(
  schema: Record<string, FieldDefinition>,
  key: string,
  field: FieldDefinition,
  topLevel: boolean,
): string | null {
  const target = field.showWhen?.field;
  if (typeof target !== "string" || target === key) {
    return "which is not a field next to it";
  }
  const sibling = Object.hasOwn(schema, target) ? schema[target] : undefined;
  if (!sibling) return "which is not a field next to it";
  if (topLevel && bucketOf(sibling) !== bucketOf(field)) {
    return `which is on the ${bucketOf(sibling)} tab, not the ${bucketOf(field)} tab`;
  }
  return null;
}
