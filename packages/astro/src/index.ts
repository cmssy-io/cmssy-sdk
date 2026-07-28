export { cmssyMiddleware, CMSSY_EDIT_PATH_PREFIX } from "./middleware";
export type { CmssyMiddlewareOptions } from "./middleware";
export { loadCmssyPage } from "./page";
export type { CmssyPageResult } from "./page";

// The data layer, the config and the editor protocol are not Astro's - they are
// the same @cmssy/core the Next adapter uses. Re-exported so an Astro app needs
// one import path for the common case.
export {
  defineCmssyConfig,
  resolveEditorOrigin,
  createCmssyClient,
  CMSSY_EDIT_HEADER,
  localizeHref,
  CMSSY_LOCALE_HEADER,
} from "@cmssy/core";
export type {
  CmssyConfig,
  CmssyEnvConfig,
  CmssyPageData,
  CmssyLayoutGroup,
  CmssyBlockContext,
} from "@cmssy/core";
