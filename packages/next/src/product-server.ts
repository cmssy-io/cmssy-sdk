import {
  graphqlRequest,
  resolveWorkspaceId,
  type CmssyProduct,
} from "@cmssy/react";
import type { CmssyNextConfig } from "./config";

export const PRODUCTS_QUERY = `query Products($workspaceId: String!, $modelSlug: String!, $filter: JSON, $limit: Int) {
  publicModelRecords(workspaceId: $workspaceId, modelSlug: $modelSlug, filter: $filter, limit: $limit) {
    items { id data variants { id sku price inventory selectedOptions { name value } } }
  }
}`;

export interface FetchProductsOptions {
  modelSlug: string;
  filter?: Record<string, unknown>;
  limit?: number;
}

export async function fetchProducts(
  config: CmssyNextConfig,
  options: FetchProductsOptions,
): Promise<CmssyProduct[]> {
  const workspaceId = await resolveWorkspaceId(config);
  const data = await graphqlRequest<{
    publicModelRecords: { items: CmssyProduct[] };
  }>(
    config,
    PRODUCTS_QUERY,
    {
      workspaceId,
      modelSlug: options.modelSlug,
      filter: options.filter ?? {},
      limit: options.limit ?? 50,
    },
    { headers: { "x-workspace-id": workspaceId } },
    "products query",
  );
  return data.publicModelRecords.items;
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
  const products = await fetchProducts(config, {
    modelSlug: options.modelSlug,
    filter: { [options.slugField ?? "slug"]: options.slug },
    limit: 1,
  });
  return products[0] ?? null;
}
