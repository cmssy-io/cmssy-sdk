import "server-only";

export { createCmssyPage, createCmssyEditPage } from "./create-cmssy-page";
export type {
  CmssyEditorProps,
  CreateCmssyPageOptions,
} from "./create-cmssy-page";
export { createCmssyNotFound } from "./create-cmssy-not-found";
export type { CreateCmssyNotFoundOptions } from "./create-cmssy-not-found";
export { CmssyLayoutSlot } from "./preset/cmssy-layout-slot";
export type { CmssyLayoutSlotProps } from "./preset/cmssy-layout-slot";

export { createDraftRoute } from "./create-draft-route";
export type { CmssyDraftRouteConfig } from "./create-draft-route";

export { getCmssyLocale } from "./locale";
export { isCmssyEditMode } from "./edit-mode";
