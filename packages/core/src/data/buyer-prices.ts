import {
  taxTreatmentKindValues,
  type CmssyPriceSource,
  type CmssyTaxTreatmentKind,
} from "@cmssy/types";
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

export const priceDisplayModeValues = ["gross", "net"] as const;

export type CmssyPriceDisplayMode = (typeof priceDisplayModeValues)[number];

export const priceListSourceValues = ["MEMBER", "COMPANY", "CHANNEL"] as const;

export type CmssyPriceListSource = (typeof priceListSourceValues)[number];

export { taxTreatmentKindValues };
export type { CmssyTaxTreatmentKind };

export interface CmssyTaxTreatment {
  kind: CmssyTaxTreatmentKind;
  legalNote: string | null;
  buyerVatId: string | null;
  buyerVatCountry: string | null;
  sellerCountry: string | null;
  shipToCountry: string | null;
}

export interface CmssyTaxedAmount {
  net: number;
  tax: number;
  gross: number;
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
  listSource: CmssyPriceListSource | null;
  minQuantity: number;
  maxQuantity: number;
  increment: number;
  tiers: CmssyPriceTier[];
  displayMode: CmssyPriceDisplayMode;
  taxRate: number;
  taxTreatmentKind: CmssyTaxTreatmentKind;
  priceAmount: CmssyTaxedAmount;
  priceMaxAmount: CmssyTaxedAmount | null;
  basePriceAmount: CmssyTaxedAmount;
}

export interface CmssyMemberPriceList {
  name: string;
}

export interface BuyerPricesVariables {
  workspaceId: string;
  items: CmssyPriceQueryItem[];
  channel?: string | null;
  previewSecret?: string | null;
}

export interface BuyerPricesResult {
  account: { prices: CmssyBuyerPrice[] };
}

export const BUYER_PRICES_QUERY = typedOperation<
  BuyerPricesResult,
  BuyerPricesVariables
>(`query BuyerPrices(
  $workspaceId: ID!
  $items: [PriceQueryItem!]!
  $channel: String
  $previewSecret: String
) {
  account {
    prices(
      workspaceId: $workspaceId
      items: $items
      channel: $channel
      previewSecret: $previewSecret
    ) {
      recordId
      variantKey
      currency
      price
      priceMax
      listed
      basePrice
      source
      listSource
      minQuantity
      maxQuantity
      increment
      tiers {
        minQty
        price
      }
      displayMode
      taxRate
      taxTreatmentKind
      priceAmount {
        net
        tax
        gross
      }
      priceMaxAmount {
        net
        tax
        gross
      }
      basePriceAmount {
        net
        tax
        gross
      }
    }
  }
}`);

export interface GetBuyerPricesOptions {
  workspaceId: string;
  accessToken: string;
  channel?: string | null;
  previewSecret?: string;
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
      ...channelVariable(options.channel),
      ...previewSecretVariable(options.previewSecret),
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
  listSource: CmssyPriceListSource | null;
  minQuantity: number;
  maxQuantity: number;
  increment: number;
  displayMode: CmssyPriceDisplayMode;
  taxRate: number;
  taxTreatmentKind: CmssyTaxTreatmentKind;
  priceAmount: CmssyTaxedAmount;
  priceMaxAmount: CmssyTaxedAmount | null;
  basePriceAmount: CmssyTaxedAmount;
}

export interface CmssyBuyerCatalogPage {
  items: CmssyBuyerCatalogPrice[];
  total: number;
  hasMore: boolean;
  currency: string | null;
  displayMode: CmssyPriceDisplayMode;
  taxTreatment: CmssyTaxTreatment;
}

export interface BuyerCatalogPricesVariables {
  workspaceId: string;
  modelSlug: string;
  filter?: Record<string, unknown> | null;
  stockState?: string | null;
  sku?: string | null;
  locale?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  sort?: CmssyBuyerCatalogSort | null;
  limit?: number | null;
  offset?: number | null;
  channel?: string | null;
  previewSecret?: string | null;
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
  $priceMin: Int
  $priceMax: Int
  $sort: BuyerCatalogSort
  $limit: Int
  $offset: Int
  $channel: String
  $previewSecret: String
) {
  account {
    catalogPrices(
      workspaceId: $workspaceId
      modelSlug: $modelSlug
      filter: $filter
      stockState: $stockState
      sku: $sku
      locale: $locale
      priceMin: $priceMin
      priceMax: $priceMax
      sort: $sort
      limit: $limit
      offset: $offset
      previewSecret: $previewSecret
      channel: $channel
    ) {
      total
      hasMore
      currency
      displayMode
      taxTreatment {
        kind
        legalNote
        buyerVatId
        buyerVatCountry
        sellerCountry
        shipToCountry
      }
      items {
        recordId
        currency
        price
        priceMax
        listed
        basePrice
        source
        listSource
        minQuantity
        maxQuantity
        increment
        displayMode
        taxRate
        taxTreatmentKind
        priceAmount {
          net
          tax
          gross
        }
        priceMaxAmount {
          net
          tax
          gross
        }
        basePriceAmount {
          net
          tax
          gross
        }
      }
    }
  }
}`);

export type GetBuyerCatalogPricesQuery = Omit<
  BuyerCatalogPricesVariables,
  "workspaceId" | "channel" | "previewSecret"
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
    {
      ...query,
      workspaceId: options.workspaceId,
      ...channelVariable(options.channel),
      ...previewSecretVariable(options.previewSecret),
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
    "buyer catalogue prices",
  );
  return data.account.catalogPrices;
}

function channelVariable(
  channel: string | null | undefined,
): { channel?: string | null } {
  return channel === undefined ? {} : { channel };
}

function previewSecretVariable(
  previewSecret: string | undefined,
): { previewSecret?: string } {
  return previewSecret ? { previewSecret } : {};
}
