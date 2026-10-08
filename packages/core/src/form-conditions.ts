import type { CmssyFormField } from "@cmssy/types";
import { evaluateFieldConditionGroup } from "@cmssy/types";

export type ConditionalFormField = Pick<
  CmssyFormField,
  "showWhen" | "requiredWhen" | "validation"
>;

export function isFormFieldVisible(
  field: Pick<ConditionalFormField, "showWhen">,
  values: Record<string, unknown>,
): boolean {
  return evaluateFieldConditionGroup(field.showWhen, values);
}

export function visibleFormFields<F extends Pick<ConditionalFormField, "showWhen">>(
  fields: readonly F[],
  values: Record<string, unknown>,
): F[] {
  return fields.filter((field) => isFormFieldVisible(field, values));
}

export function isFormFieldRequired(
  field: ConditionalFormField,
  values: Record<string, unknown>,
): boolean {
  if (!isFormFieldVisible(field, values)) return false;
  if (field.validation?.required === true) return true;
  return (
    field.requiredWhen != null &&
    evaluateFieldConditionGroup(field.requiredWhen, values)
  );
}
