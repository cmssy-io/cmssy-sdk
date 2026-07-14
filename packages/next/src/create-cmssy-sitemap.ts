import type { MetadataRoute } from "next";
import {
  fetchPages,
  fetchSiteConfig,
  type CmssyClientConfig,
} from "@cmssy/react";
import type { CmssyNextConfig } from "./config";
import { resolveSeoBaseUrl, type SeoBaseUrlOption } from "./seo-base-url";
import { localizedPath, normalizeSlug, resolveSeoLocales } from "./seo-paths";

export interface CreateCmssySitemapOptions extends SeoBaseUrlOption {
  /** Extra static entries appended to the generated page list. */
  extra?: MetadataRoute.Sitemap;
  /**
   * Additional page slugs to omit. The workspace's configured 404 page
   * (Settings → 404 page) is excluded automatically via its id, so this is
   * only for extra slugs you never want indexed.
   */
  excludeSlugs?: string[];
}

/**
 * Builds the default export for Next's `app/sitemap.ts` from the workspace's
 * published pages. Emits one entry per page with per-locale `alternates` when
 * the config enables multiple locales. Drop in as:
 *
 *   export default createCmssySitemap(cmssy);
 */
export function createCmssySitemap(
  config: CmssyNextConfig,
  options: CreateCmssySitemapOptions = {},
) {
  const clientConfig: CmssyClientConfig = {
    apiUrl: config.apiUrl,
    org: config.org,
    workspaceSlug: config.workspaceSlug,
  };

  return async function sitemap(): Promise<MetadataRoute.Sitemap> {
    let pages: Awaited<ReturnType<typeof fetchPages>> = [];
    try {
      pages = await fetchPages(clientConfig);
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[cmssy] sitemap page fetch failed", err);
      }
      pages = [];
    }

    // The workspace's configured 404 page (Settings → 404 page) is a real
    // published page; exclude it by id so it is never advertised as indexable.
    let siteConfig: Awaited<ReturnType<typeof fetchSiteConfig>> = null;
    try {
      siteConfig = await fetchSiteConfig(clientConfig);
    } catch {
      siteConfig = null;
    }
    const notFoundPageId = siteConfig?.notFoundPageId ?? null;

    const baseUrl = await resolveSeoBaseUrl(config, options.baseUrl);
    const { defaultLocale, locales } = resolveSeoLocales(config, siteConfig);

    const excluded = new Set((options.excludeSlugs ?? []).map(normalizeSlug));

    // Every language version is its own <url>, and each lists all of them
    // (itself included) plus x-default. Listing only the default language and
    // hanging the translations off it as alternates leaves the translated URLs
    // out of the sitemap entirely - they are then a hint, not a submission.
    const languagesFor = (slug: string) =>
      locales.length > 1
        ? {
            languages: {
              ...Object.fromEntries(
                locales.map((locale) => [
                  locale,
                  `${baseUrl}${localizedPath(slug, locale, defaultLocale)}`,
                ]),
              ),
              "x-default": `${baseUrl}${localizedPath(slug, defaultLocale, defaultLocale)}`,
            },
          }
        : undefined;

    const entries: MetadataRoute.Sitemap = pages
      .map((page) => ({ ...page, slug: normalizeSlug(page.slug) }))
      .filter((page) => page.id !== notFoundPageId && !excluded.has(page.slug))
      .flatMap((page) => {
        const lastModified = page.updatedAt ?? page.publishedAt ?? undefined;
        const alternates = languagesFor(page.slug);
        return locales.map((locale) => ({
          url: `${baseUrl}${localizedPath(page.slug, locale, defaultLocale)}`,
          ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
          ...(alternates ? { alternates } : {}),
        }));
      });

    return options.extra ? [...entries, ...options.extra] : entries;
  };
}
