import {
  fetchProducts as fetchProductsFromCore,
  fetchProduct as fetchProductFromCore,
  type CmssyConfig,
  type CmssyProduct,
  type CmssyProductPage,
  type FetchProductOptions,
  type FetchProductsOptions,
} from "@cmssy/core";
import { getCmssyLocale } from "./locale";

/**
 * The request's locale, when there is a request. A catalog read also runs at
 * build time (generateStaticParams, a static page), where next/headers throws -
 * there, undefined means "the workspace's default language", which is what a
 * catalog read did before locales existed.
 */
async function requestLocale(config: CmssyConfig): Promise<string | undefined> {
  try {
    return await getCmssyLocale(config);
  } catch {
    return undefined;
  }
}

export async function fetchProducts(
  config: CmssyConfig,
  options: FetchProductsOptions,
): Promise<CmssyProductPage> {
  const locale = options.locale ?? (await requestLocale(config));
  return fetchProductsFromCore(config, { ...options, locale });
}

export async function fetchProduct(
  config: CmssyConfig,
  options: FetchProductOptions,
): Promise<CmssyProduct | null> {
  const locale = options.locale ?? (await requestLocale(config));
  return fetchProductFromCore(config, { ...options, locale });
}
