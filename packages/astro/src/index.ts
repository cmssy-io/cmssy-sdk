export { cmssyMiddleware, CMSSY_EDIT_PATH_PREFIX } from "./middleware";
export type { CmssyMiddlewareOptions } from "./middleware";
export { loadCmssyPage } from "./page";
export type { CmssyPageResult } from "./page";
export { createCmssySitemap, createCmssyRobots } from "./seo";
export type { CmssySitemapEntry, CmssySitemapOptions } from "./seo";

// The data layer, the config and the editor protocol are not Astro's - they are
// the same @cmssy/core the Next adapter uses. Re-exported so an Astro app needs
// one import path for the common case.
export {
  defineCmssyConfig,
  fetchPage,
  fetchPages,
  fetchPageMeta,
  fetchLayouts,
  fetchProducts,
  fetchProduct,
  createCmssyClient,
  resolveSiteLocales,
  localizeHref,
  buildBlockContext,
  CMSSY_EDIT_HEADER,
  CMSSY_LOCALE_HEADER,
} from "@cmssy/core";
export type {
  CmssyConfig,
  CmssyEnvConfig,
  CmssyPageData,
  CmssyLayoutGroup,
  CmssyBlockContext,
} from "@cmssy/core";
