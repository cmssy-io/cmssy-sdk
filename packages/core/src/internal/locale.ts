// @cmssy/core/internal/locale — locale + path helpers split out of the main
// internal barrel so edge middleware pulls only these, not the content client,
// relation resolver, forms, etc. First-party plumbing, not a public API.

export {
  CMSSY_LOCALE_HEADER,
  localeForPathname,
  localeForPath,
  splitCmssyLocale,
} from "../locale";
export {
  localesFromSiteConfig,
  resolveSiteLocales,
  splitLocaleFromPath,
} from "../data/site-locales";
export type { CmssySiteLocales } from "../data/site-locales";
export {
  localizeHref,
  buildLocaleSwitchHref,
  localizeHtmlLinks,
} from "../data/localize-href";
export { localizedPath } from "../seo-paths";
