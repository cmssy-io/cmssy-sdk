// @cmssy/core/internal — plumbing shared by the first-party @cmssy packages
// (react/next/astro/remix). NOT a stable public API: no semver guarantees,
// not for app code. Everything a shop or site needs is a GraphQL query via
// `graphqlRequest`, or lives on the public `@cmssy/core` entry.

export {
  fetchPage,
  fetchPageById,
  fetchPages,
  fetchPageMeta,
  fetchLayouts,
  normalizeSlug,
  resolveApiUrl,
  resolvePublicUrl,
} from "./content/content-client";
export {
  getBlockContentForLanguage,
  asBucket,
} from "./content/get-block-content";

export {
  fetchSiteConfig,
  resolveWorkspaceId,
  cachedWorkspaceId,
  clearWorkspaceIdCache,
} from "./data/settings-client";
export { collectFormIds, resolveForms } from "./data/resolve-forms";
export {
  localesFromSiteConfig,
  resolveSiteLocales,
  splitLocaleFromPath,
} from "./data/site-locales";
export type { CmssySiteLocales } from "./data/site-locales";
export {
  localizeHref,
  buildLocaleSwitchHref,
  localizeHtmlLinks,
} from "./data/localize-href";
export {
  SITE_CONFIG_QUERY,
  MODEL_DEFINITIONS_QUERY,
  MODEL_RECORDS_QUERY,
  FORM_QUERY,
  SUBMIT_FORM_MUTATION,
} from "./data/queries";
export {
  RECORDS_BY_IDS_QUERY,
  normalizeRelationContent,
  resolveRelationContent,
} from "./data/relation-resolver";
export type {
  BlockSchemaMap,
  RelationContentEntry,
} from "./data/relation-resolver";

export {
  CMSSY_LOCALE_HEADER,
  localeForPathname,
  localeForPath,
  splitCmssyLocale,
} from "./locale";
export { localizedPath } from "./seo-paths";
export { buildBlockContext } from "./block-context";

export { resolveInitialTarget } from "./bridge/messages";
export { cmssySecretsMatch } from "./secret-match";
export { cmssyCspHeaders, toCspOrigin } from "./csp";
export { isDevelopment } from "./config";
