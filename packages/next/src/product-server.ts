import {
  graphqlRequest,
  resolveWorkspaceId,
  type CmssyProduct,
} from "@cmssy/react";
import type { CmssyNextConfig } from "./config";

export const PRODUCTS_QUERY = `query Products($workspaceId: String!, $modelSlug: String!, $filter: JSON, $limit: Int, $offset: Int, $sort: String) {
  public {
    model {
      records(workspaceId: $workspaceId, modelSlug: $modelSlug, filter: $filter, limit: $limit, offset: $offset, sort: $sort) {
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

export interface FetchProductsOptions {
  modelSlug: string;
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  sort?: string;
}

export interface CmssyProductPage {
  items: CmssyProduct[];
  total: number;
  hasMore: boolean;
}

export async function fetchProducts(
  config: CmssyNextConfig,
  options: FetchProductsOptions,
): Promise<CmssyProductPage> {
  const workspaceId = await resolveWorkspaceId(config);
  const data = await graphqlRequest<{
    public: { model: { records: CmssyProductPage } };
  }>(
    config,
    PRODUCTS_QUERY,
    {
      workspaceId,
      modelSlug: options.modelSlug,
      filter: options.filter ?? {},
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      sort: options.sort ?? null,
    },
    { headers: { "x-workspace-id": workspaceId } },
    "products query",
  );
  return data.public.model.records;
}

export interface FetchProductOptions {
  modelSlug: string;
  slug: string;
  slugField?: string;
}

export async function fetchProduct(
  config: CmssyNextConfig,
  options: FetchProductOptions,
): Promise<CmssyProduct | null> {
  const page = await fetchProducts(config, {
    modelSlug: options.modelSlug,
    filter: { [options.slugField ?? "slug"]: options.slug },
    limit: 1,
  });
  return page.items[0] ?? null;
}
