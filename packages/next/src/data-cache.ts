import type { FetchLike } from "@cmssy/core";

export const CMSSY_CONTENT_TAG = "cmssy-content";

export interface CmssyDataCacheOptions {
  revalidate: number | false;
  tags?: string[];
}

export function cmssyContentTags(tags: string[] = []): string[] {
  return [...new Set([CMSSY_CONTENT_TAG, ...tags])];
}

export function cmssyCachedFetch(cache: CmssyDataCacheOptions): FetchLike {
  const next = {
    revalidate: cache.revalidate,
    tags: cmssyContentTags(cache.tags),
  };
  return (url, init) => fetch(url, { ...init, next } as RequestInit);
}
