import type { CmssyClientConfig, FetchLike } from "../content/content-client";
import type {
  CmssyBuyerCatalogSort,
  CmssyBuyerPrice,
  CmssyPriceDisplayMode,
  CmssyPriceQueryItem,
} from "./buyer-prices";
import { typedOperation } from "./document";
import { graphqlRequest } from "./graphql-request";
import type { RetryOption } from "./http";

export const CMSSY_PUBLIC_PRICES_MAX_ITEMS = 50;

export const priceWithheldReasonValues = [
  "MEMBERS_ONLY",
  "COMPANY_MEMBERS_ONLY",
] as const;

export type CmssyPriceWithheldReason =
  (typeof priceWithheldReasonValues)[number];

export interface CmssyPublicPricedRecordData {
  id: string;
  modelId: string;
  data: Record<string, unknown>;
  status: string | null;
  available: number | null;
  quantityIncrement: number;
  variantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CmssyPublicPricedRecord {
  record: CmssyPublicPricedRecordData;
  price: CmssyBuyerPrice | null;
}

export interface CmssyPublicPriceResult {
  items: CmssyPublicPricedRecord[];
  currency: string | null;
  displayMode: CmssyPriceDisplayMode;
  priceWithheld: CmssyPriceWithheldReason | null;
  nextChangeAt: string | null;
}

export interface CmssyPublicCatalogPage extends CmssyPublicPriceResult {
  total: number;
  hasMore: boolean;
}

export interface PublicPricesVariables {
  workspaceId: string;
  channel: string;
  items: CmssyPriceQueryItem[];
  locale?: string | null;
}

export interface PublicPricesResult {
  public: { pricing: { prices: CmssyPublicPriceResult } };
}

export const PUBLIC_PRICES_QUERY = typedOperation<
  PublicPricesResult,
  PublicPricesVariables
>(`query PublicPrices(
  $workspaceId: String!
  $channel: String!
  $items: [PriceQueryItem!]!
  $locale: String
) {
  public {
    pricing {
      prices(
        workspaceId: $workspaceId
        channel: $channel
        items: $items
        locale: $locale
      ) {
        currency
        displayMode
        priceWithheld
        nextChangeAt
        items {
          record {
            id
            modelId
            data
            status
            available
            quantityIncrement
            variantCount
            createdAt
            updatedAt
          }
          price {
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
      }
    }
  }
}`);

export interface PublicCatalogPricesVariables {
  workspaceId: string;
  channel: string;
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

export interface PublicCatalogPricesResult {
  public: { pricing: { catalogPrices: CmssyPublicCatalogPage } };
}

export const PUBLIC_CATALOG_PRICES_QUERY = typedOperation<
  PublicCatalogPricesResult,
  PublicCatalogPricesVariables
>(`query PublicCatalogPrices(
  $workspaceId: String!
  $channel: String!
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
  public {
    pricing {
      catalogPrices(
        workspaceId: $workspaceId
        channel: $channel
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
        currency
        displayMode
        priceWithheld
        nextChangeAt
        items {
          record {
            id
            modelId
            data
            status
            available
            quantityIncrement
            variantCount
            createdAt
            updatedAt
          }
          price {
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
      }
    }
  }
}`);

export interface GetPublicPricesOptions {
  workspaceId: string;
  channel?: string;
  locale?: string | null;
  fetch?: FetchLike;
  signal?: AbortSignal;
  retry?: RetryOption;
}

function requireChannel(
  config: CmssyClientConfig,
  options: GetPublicPricesOptions,
  helper: string,
): string {
  const channel = (options.channel ?? config.channel)?.trim();
  if (!channel) {
    throw new Error(
      `cmssy: ${helper} needs a sales channel - set channel in the client config or pass it in the options`,
    );
  }
  return channel;
}

export async function getPublicPrices(
  config: CmssyClientConfig,
  items: readonly CmssyPriceQueryItem[],
  options: GetPublicPricesOptions,
): Promise<CmssyPublicPriceResult> {
  const channel = requireChannel(config, options, "getPublicPrices");
  if (items.length > CMSSY_PUBLIC_PRICES_MAX_ITEMS) {
    throw new Error(
      `cmssy: getPublicPrices takes at most ${CMSSY_PUBLIC_PRICES_MAX_ITEMS} items, got ${items.length} - split the request`,
    );
  }
  const data = await graphqlRequest(
    config,
    PUBLIC_PRICES_QUERY,
    {
      workspaceId: options.workspaceId,
      channel,
      items: items.map(({ recordId, variantKey }) =>
        variantKey ? { recordId, variantKey } : { recordId },
      ),
      ...(options.locale ? { locale: options.locale } : {}),
    },
    {
      public: true,
      fetch: options.fetch,
      signal: options.signal,
      retry: options.retry,
      headers: { "x-workspace-id": options.workspaceId },
    },
    "channel prices",
  );
  return data.public.pricing.prices;
}

export type GetPublicCatalogPricesQuery = Omit<
  PublicCatalogPricesVariables,
  "workspaceId" | "channel"
>;

export async function getPublicCatalogPrices(
  config: CmssyClientConfig,
  query: GetPublicCatalogPricesQuery,
  options: Omit<GetPublicPricesOptions, "locale">,
): Promise<CmssyPublicCatalogPage> {
  const channel = requireChannel(config, options, "getPublicCatalogPrices");
  const data = await graphqlRequest(
    config,
    PUBLIC_CATALOG_PRICES_QUERY,
    { ...query, workspaceId: options.workspaceId, channel },
    {
      public: true,
      fetch: options.fetch,
      signal: options.signal,
      retry: options.retry,
      headers: { "x-workspace-id": options.workspaceId },
    },
    "channel catalogue prices",
  );
  return data.public.pricing.catalogPrices;
}
