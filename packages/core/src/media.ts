import type { ResolvedMedia } from "@cmssy/types";

/**
 * A media value as it can reach a block during the CMS-1149 transition: the
 * resolved object a current API returns, or the bare URL string an API that
 * has not been upgraded yet still returns. The string arm exists so a site can
 * upgrade its SDK and its cmssy independently; it goes away once no supported
 * cmssy serves strings.
 */
export type MediaLike = ResolvedMedia | string | null | undefined;

export function mediaUrl(value: MediaLike): string | null {
  if (typeof value === "string") return value || null;
  return value?.url ?? null;
}

export function mediaUrls(
  value: readonly MediaLike[] | null | undefined,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => mediaUrl(item))
    .filter((url): url is string => url !== null);
}

export function mediaAlt(value: MediaLike): string | undefined {
  return typeof value === "string" ? undefined : value?.alt;
}
