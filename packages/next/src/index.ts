export { createCmssyPage, createCmssyEditPage } from "./create-cmssy-page";
export type {
  CmssyEditorProps,
  CreateCmssyPageOptions,
} from "./create-cmssy-page";
export {
  CMSSY_EDIT_PATH_PREFIX,
  cmssyEditRewrite,
  createCmssyEditMiddleware,
} from "./edit-middleware";
export { createCmssyNotFound } from "./create-cmssy-not-found";
export type { CreateCmssyNotFoundOptions } from "./create-cmssy-not-found";
export { createCmssyRobots } from "./create-cmssy-robots";
export type { CreateCmssyRobotsOptions } from "./create-cmssy-robots";
export { createCmssySitemap } from "./create-cmssy-sitemap";
export type {
  CreateCmssySitemapOptions,
  CmssySitemapContext,
} from "./create-cmssy-sitemap";
export { buildCmssyMetadata } from "./build-cmssy-metadata";
export type { BuildCmssyMetadataOptions } from "./build-cmssy-metadata";
export { createDraftRoute } from "./create-draft-route";
export type { CmssyDraftRouteConfig } from "./create-draft-route";
export { isCmssyEditRequest, isCmssyEditMode } from "./edit-mode";
export { getCmssyLocale } from "./locale";
export {
  createCmssyLocaleMiddleware,
  resolveLocaleFromPathname,
} from "./locale-middleware";
export { createCmssyAuthRoute } from "./create-auth-route";
export type { CmssyAuthRouteHandlers } from "./create-auth-route";
export { createCmssyCartRoute, CMSSY_CART_COOKIE } from "./create-cart-route";
export type { CmssyCartRouteHandlers } from "./create-cart-route";
export { createCmssyOrdersRoute } from "./create-orders-route";
export type { CmssyOrdersRouteHandlers } from "./create-orders-route";
export { getCmssyUser, getCmssyAccessToken } from "./auth-server";
export { createCmssyAuthMiddleware } from "./auth-middleware";
export type { CmssyAuthMiddleware } from "./auth-middleware";
export { fetchProducts, fetchProduct } from "./product-server";

// Re-exported from @cmssy/core so a Next app needs one import path for the
// common case. Everything below is framework-agnostic and equally available to
// a Vue, Astro or Remix app straight from @cmssy/core.
export {
  defineCmssyConfig,
  assertAuthConfig,
  resolveEditorOrigin,
  DEFAULT_CMSSY_EDITOR_ORIGINS,
  cmssyCspHeaders,
  applyCmssyCsp,
  CMSSY_EDIT_HEADER,
  CMSSY_EDIT_QUERY_PARAM,
  CMSSY_SECRET_QUERY_PARAM,
  CMSSY_LOCALE_HEADER,
  localeForPathname,
  splitCmssyLocale,
  CMSSY_SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sealSession,
  openSession,
  isAccessExpired,
  sessionCookieOptions,
  resolveApiUrl,
  DEFAULT_CMSSY_API_URL,
  evaluateFieldConditionGroup,
  fetchOrderByToken,
  verifyCmssyWebhook,
  CmssyWebhookError,
} from "@cmssy/core";
export type {
  CmssyConfig,
  CmssyEnvConfig,
  CmssyAuthConfig,
  CmssyCspOptions,
  CmssySessionPayload,
  CmssySessionUser,
  SessionCookieOptions,
  FieldCondition,
  FieldConditionGroup,
  FieldConditionLogic,
  FetchProductsOptions,
  FetchProductOptions,
  CmssyStockState,
  CmssyProductPage,
  FetchOrderByTokenOptions,
  MyOrdersResult,
  CmssyWebhookEvent,
  CmssyWebhookOrder,
  VerifyCmssyWebhookOptions,
} from "@cmssy/core";
