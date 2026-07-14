export { createCmssyLoader, createCmssyHeaders } from "./loader";
export type { CmssyRouteData } from "./loader";
export { createCmssySitemap, createCmssyRobots } from "./seo";
export type { CmssySitemapEntry, CmssySitemapOptions } from "./seo";

// The data layer, the config and the editor protocol are not React Router's -
// they are the same @cmssy/core every adapter uses.
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
  localizedPath,
  buildBlockContext,
  isVerifiedEditUrl,
  CMSSY_LOCALE_HEADER,
} from "@cmssy/core";
export type {
  CmssyConfig,
  CmssyEnvConfig,
  CmssyPageData,
  CmssyLayoutGroup,
  CmssyBlockContext,
} from "@cmssy/core";
