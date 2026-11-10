import type { FieldDefinition } from "@cmssy/types";

export function assertShowWhenTargets(
  blockType: string,
  schema: Record<string, FieldDefinition>,
  path: readonly string[] = [],
): void {
  for (const [key, field] of Object.entries(schema)) {
    const at = [...path, key].join(".");
    const target = field.showWhen?.field;
    if (
      field.showWhen &&
      (typeof target !== "string" ||
        target === key ||
        !Object.hasOwn(schema, target))
    ) {
      throw new Error(
        `cmssy: block "${blockType}" field "${at}" has showWhen on ${JSON.stringify(target)}, which is not a field next to it`,
      );
    }
    if (field.itemSchema) {
      assertShowWhenTargets(blockType, field.itemSchema, [...path, key]);
    }
  }
}
