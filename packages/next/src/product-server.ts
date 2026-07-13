import { graphqlRequest, resolveWorkspaceId } from "@cmssy/react";
import { getCmssyLocale } from "./locale";
import type {
  CmssyProduct,
  CmssyStockState,
  FetchProductsOptions,
  FetchProductOptions,
  CmssyProductPage,
} from "@cmssy/types";
import type { CmssyNextConfig } from "./config";

// These shapes live in @cmssy/types; re-exported for consumers.
export type {
  CmssyStockState,
  FetchProductsOptions,
  FetchProductOptions,
  CmssyProductPage,
};

export const PRODUCTS_QUERY = `query Products($workspaceId: String!, $modelSlug: String!, $filter: JSON, $stockState: String, $locale: String, $limit: Int, $offset: Int, $sort: String) {
  public {
    model {
      records(workspaceId: $workspaceId, modelSlug: $modelSlug, filter: $filter, stockState: $stockState, locale: $locale, limit: $limit, offset: $offset, sort: $sort) {
        total
        hasMore
        items {
          id
          data
          priceTiers { minQty price }
          variants { id sku price inventory tiers { minQty price } selectedOptions { name value } }
        }
      }
    }
  }
}`;

/**
 * The request's locale, when there is a request. fetchProducts also runs at
 * build time (generateStaticParams, a static page), where next/headers throws -
 * there, null means "the workspace's default language", which is what a
 * catalog read did before locales existed.
 */
async function requestLocale(config: CmssyNextConfig): Promise<string | null> {
  try {
    return await getCmssyLocale(config);
  } catch {
    return null;
  }
}

export async function fetchProducts(
  config: CmssyNextConfig,
  options: FetchProductsOptions,
): Promise<CmssyProductPage> {
  const workspaceId = await resolveWorkspaceId(config);
  const locale = options.locale ?? (await requestLocale(config));
  const data = await graphqlRequest<{
    public: { model: { records: CmssyProductPage } };
  }>(
    config,
    PRODUCTS_QUERY,
    {
      workspaceId,
      modelSlug: options.modelSlug,
      filter: options.filter ?? {},
      stockState: options.stockState ?? null,
      locale,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      sort: options.sort ?? null,
    },
    { headers: { "x-workspace-id": workspaceId } },
    "products query",
  );
  return data.public.model.records;
}

export async function fetchProduct(
  config: CmssyNextConfig,
  options: FetchProductOptions,
): Promise<CmssyProduct | null> {
  const page = await fetchProducts(config, {
    modelSlug: options.modelSlug,
    filter: { [options.slugField ?? "slug"]: options.slug },
    locale: options.locale,
    limit: 1,
  });
  return page.items[0] ?? null;
}
