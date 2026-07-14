import { graphqlRequest } from "../data/graphql-request";
import { resolveWorkspaceId } from "../data/settings-client";
import type {
  CmssyProduct,
  CmssyStockState,
  FetchProductsOptions,
  FetchProductOptions,
  CmssyProductPage,
} from "@cmssy/types";
import type { CmssyConfig } from "../config";

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
 * A catalog read is plain data: it takes the locale it is given. Framework
 * adapters are the ones that know how to find the locale of the current request
 * (@cmssy/next reads it from the middleware header) and pass it in. Omitting it
 * means "the workspace's default language".
 */
export async function fetchProducts(
  config: CmssyConfig,
  options: FetchProductsOptions,
): Promise<CmssyProductPage> {
  const workspaceId = await resolveWorkspaceId(config);
  const locale = options.locale ?? null;
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
  config: CmssyConfig,
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
