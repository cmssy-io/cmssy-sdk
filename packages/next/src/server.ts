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

export { buildCmssyMetadata } from "./build-cmssy-metadata";
export type { BuildCmssyMetadataOptions } from "./build-cmssy-metadata";
export { createCmssyRobots } from "./create-cmssy-robots";
export type { CreateCmssyRobotsOptions } from "./create-cmssy-robots";
export { createCmssySitemap } from "./create-cmssy-sitemap";
export type {
  CreateCmssySitemapOptions,
  CmssySitemapContext,
} from "./create-cmssy-sitemap";

export { createCmssyAuthRoute } from "./create-auth-route";
export type { CmssyAuthRouteHandlers } from "./create-auth-route";
export { createCmssyCartRoute, CMSSY_CART_COOKIE } from "./create-cart-route";
export type { CmssyCartRouteHandlers } from "./create-cart-route";
export { createCmssyOrdersRoute } from "./create-orders-route";
export type { CmssyOrdersRouteHandlers } from "./create-orders-route";
export { createDraftRoute } from "./create-draft-route";
export type { CmssyDraftRouteConfig } from "./create-draft-route";

export { getCmssyUser, getCmssyAccessToken } from "./auth-server";
export { getCmssyLocale } from "./locale";
export { isCmssyEditMode } from "./edit-mode";
export { fetchProducts, fetchProduct } from "./product-server";
