import {
  checkCmssyEditMode as checkCore,
  type EditSmokeOptions,
  type EditSmokeResult,
} from "@cmssy/core/testing";

export type { EditSmokeOptions, EditSmokeResult };

export function checkCmssyEditMode(
  options: EditSmokeOptions,
): Promise<EditSmokeResult> {
  return checkCore({ ...options, editRoute: options.editRoute ?? false });
}
