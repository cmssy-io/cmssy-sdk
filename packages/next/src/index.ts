// Anything here reads the cmssy config (process.env) or Next's request headers,
// so it must never reach the browser bundle. Importing a VALUE from here in a
// client component used to compile fine and then throw "missing required
// configuration" at page load, which reads like a config mistake and is really
// an import mistake. Now it is a build error, with the file that caused it.
// Client-side pieces live in "@cmssy/next/client"; pure path maths in the
// exports that carry no config.
import "server-only";

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
export { cmssyCspHeaders, applyCmssyCsp } from "./csp";
export type { CmssyCspOptions } from "./csp";
export {
  CMSSY_EDIT_HEADER,
  CMSSY_EDIT_QUERY_PARAM,
  CMSSY_SECRET_QUERY_PARAM,
  isCmssyEditRequest,
  isCmssyEditMode,
} from "./edit-mode";
export { defineCmssyConfig } from "./config";
export type {
  CmssyNextConfig,
  CmssyEnvConfig,
  CmssyAuthConfig,
} from "./config";
export {
  CMSSY_LOCALE_HEADER,
  localeForPathname,
  splitCmssyLocale,
  getCmssyLocale,
} from "./locale";
export {
  createCmssyLocaleMiddleware,
  resolveLocaleFromPathname,
} from "./locale-middleware";
export {
  CMSSY_SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sealSession,
  openSession,
  isAccessExpired,
  sessionCookieOptions,
} from "./session";
export type {
  CmssySessionPayload,
  CmssySessionUser,
  SessionCookieOptions,
} from "./session";
export { createCmssyAuthRoute } from "./create-auth-route";
export type { CmssyAuthRouteHandlers } from "./create-auth-route";
export { createCmssyCartRoute, CMSSY_CART_COOKIE } from "./create-cart-route";
export type { CmssyCartRouteHandlers } from "./create-cart-route";
export {
  assertAuthConfig,
  resolveEditorOrigin,
  DEFAULT_CMSSY_EDITOR_ORIGINS,
} from "./config";
export { resolveApiUrl, DEFAULT_CMSSY_API_URL } from "@cmssy/react";
export { evaluateFieldConditionGroup } from "@cmssy/react";
export type {
  FieldCondition,
  FieldConditionGroup,
  FieldConditionLogic,
} from "@cmssy/react";
export { getCmssyUser, getCmssyAccessToken } from "./auth-server";
export { createCmssyAuthMiddleware } from "./auth-middleware";
export type { CmssyAuthMiddleware } from "./auth-middleware";
export { fetchProducts, fetchProduct } from "./product-server";
export type {
  FetchProductsOptions,
  CmssyStockState,
  FetchProductOptions,
  CmssyProductPage,
} from "./product-server";
export { fetchOrderByToken } from "./order-server";
export type { FetchOrderByTokenOptions } from "./order-server";
export { createCmssyOrdersRoute } from "./create-orders-route";
export type { CmssyOrdersRouteHandlers } from "./create-orders-route";
export type { MyOrdersResult } from "./orders-client";
export { verifyCmssyWebhook, CmssyWebhookError } from "./verify-webhook";
export type {
  CmssyWebhookEvent,
  CmssyWebhookOrder,
  VerifyCmssyWebhookOptions,
} from "./verify-webhook";
