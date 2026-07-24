export { createCmssyLoader, createCmssyHeaders } from "./loader";
export type { CmssyRouteData } from "./loader";

// The data layer, the config and the editor protocol are not React Router's -
// they are the same @cmssy/core every adapter uses.
export {
  defineCmssyConfig,
  createCmssyClient,
  buildBlockContext,
  isVerifiedEditUrl,
} from "@cmssy/core";
export {
  fetchPage,
  fetchPages,
  fetchPageMeta,
  fetchLayouts,
  resolveSiteLocales,
  localizeHref,
  localizedPath,
  CMSSY_LOCALE_HEADER,
} from "@cmssy/core/internal";
export type {
  CmssyConfig,
  CmssyEnvConfig,
  CmssyPageData,
  CmssyLayoutGroup,
  CmssyBlockContext,
} from "@cmssy/core";
