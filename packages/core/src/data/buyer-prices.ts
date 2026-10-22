import type { CmssyPriceSource } from "@cmssy/types";
import type { CmssyClientConfig, FetchLike } from "../content/content-client";
import { typedOperation } from "./document";
import { graphqlRequest } from "./graphql-request";
import type { RetryOption } from "./http";

export const CMSSY_BUYER_PRICES_MAX_ITEMS = 100;

export interface CmssyPriceQueryItem {
  recordId: string;
  variantKey?: string | null;
}

export interface CmssyPriceTier {
  minQty: number;
  price: number;
}

export interface CmssyBuyerPrice {
  recordId: string;
  variantKey: string | null;
  currency: string;
  price: number;
  priceMax: number | null;
  listed: boolean;
  basePrice: number;
  source: CmssyPriceSource;
  tiers: CmssyPriceTier[];
}

export interface CmssyMemberPriceList {
  name: string;
}

export interface BuyerPricesVariables {
  workspaceId: string;
  items: CmssyPriceQueryItem[];
}

export interface BuyerPricesResult {
  account: { prices: CmssyBuyerPrice[] };
}

export const BUYER_PRICES_QUERY = typedOperation<
  BuyerPricesResult,
  BuyerPricesVariables
>(`query BuyerPrices($workspaceId: ID!, $items: [PriceQueryItem!]!) {
  account {
    prices(workspaceId: $workspaceId, items: $items) {
      recordId
      variantKey
      currency
      price
      priceMax
      listed
      basePrice
      source
      tiers {
        minQty
        price
      }
    }
  }
}`);

export interface GetBuyerPricesOptions {
  workspaceId: string;
  accessToken: string;
  fetch?: FetchLike;
  signal?: AbortSignal;
  retry?: RetryOption;
}

export async function getBuyerPrices(
  config: CmssyClientConfig,
  items: readonly CmssyPriceQueryItem[],
  options: GetBuyerPricesOptions,
): Promise<CmssyBuyerPrice[]> {
  if (items.length === 0) return [];
  if (items.length > CMSSY_BUYER_PRICES_MAX_ITEMS) {
    throw new Error(
      `cmssy: getBuyerPrices takes at most ${CMSSY_BUYER_PRICES_MAX_ITEMS} items, got ${items.length} - split the request`,
    );
  }
  if (!options.accessToken) {
    throw new Error(
      "cmssy: getBuyerPrices needs the signed-in member's accessToken - an anonymous visitor reads the catalogue price",
    );
  }
  const data = await graphqlRequest(
    config,
    BUYER_PRICES_QUERY,
    {
      workspaceId: options.workspaceId,
      items: items.map(({ recordId, variantKey }) =>
        variantKey ? { recordId, variantKey } : { recordId },
      ),
    },
    {
      public: true,
      fetch: options.fetch,
      signal: options.signal,
      retry: options.retry,
      headers: {
        "x-workspace-id": options.workspaceId,
        authorization: `Bearer ${options.accessToken}`,
      },
    },
    "buyer prices",
  );
  return data.account.prices;
}

export type CmssyBuyerCatalogSort = "PRICE_ASC" | "PRICE_DESC";

export interface CmssyBuyerCatalogPrice {
  recordId: string;
  currency: string;
  price: number;
  priceMax: number | null;
  listed: boolean;
  basePrice: number;
  source: CmssyPriceSource;
}

export interface CmssyBuyerCatalogPage {
  items: CmssyBuyerCatalogPrice[];
  total: number;
  hasMore: boolean;
}

export interface BuyerCatalogPricesVariables {
  workspaceId: string;
  modelSlug: string;
  filter?: Record<string, unknown> | null;
  stockState?: string | null;
  sku?: string | null;
  locale?: string | null;
  currency?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  sort?: CmssyBuyerCatalogSort | null;
  limit?: number | null;
  offset?: number | null;
}

export interface BuyerCatalogPricesResult {
  account: { catalogPrices: CmssyBuyerCatalogPage };
}

export const BUYER_CATALOG_PRICES_QUERY = typedOperation<
  BuyerCatalogPricesResult,
  BuyerCatalogPricesVariables
>(`query BuyerCatalogPrices(
  $workspaceId: ID!
  $modelSlug: String!
  $filter: JSON
  $stockState: String
  $sku: String
  $locale: String
  $currency: String
  $priceMin: Int
  $priceMax: Int
  $sort: BuyerCatalogSort
  $limit: Int
  $offset: Int
) {
  account {
    catalogPrices(
      workspaceId: $workspaceId
      modelSlug: $modelSlug
      filter: $filter
      stockState: $stockState
      sku: $sku
      locale: $locale
      currency: $currency
      priceMin: $priceMin
      priceMax: $priceMax
      sort: $sort
      limit: $limit
      offset: $offset
    ) {
      total
      hasMore
      items {
        recordId
        currency
        price
        priceMax
        listed
        basePrice
        source
      }
    }
  }
}`);

export type GetBuyerCatalogPricesQuery = Omit<
  BuyerCatalogPricesVariables,
  "workspaceId"
>;

export async function getBuyerCatalogPrices(
  config: CmssyClientConfig,
  query: GetBuyerCatalogPricesQuery,
  options: GetBuyerPricesOptions,
): Promise<CmssyBuyerCatalogPage> {
  if (!options.accessToken) {
    throw new Error(
      "cmssy: getBuyerCatalogPrices needs the signed-in member's accessToken - an anonymous visitor reads the catalogue",
    );
  }
  const data = await graphqlRequest(
    config,
    BUYER_CATALOG_PRICES_QUERY,
    { ...query, workspaceId: options.workspaceId },
    {
      public: true,
      fetch: options.fetch,
      signal: options.signal,
      retry: options.retry,
      headers: {
        "x-workspace-id": options.workspaceId,
        authorization: `Bearer ${options.accessToken}`,
      },
    },
    "buyer catalogue prices",
  );
  return data.account.catalogPrices;
}
