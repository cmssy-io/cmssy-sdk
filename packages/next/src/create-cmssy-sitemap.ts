import type { MetadataRoute } from "next";
import { fetchPages, type CmssyClientConfig } from "@cmssy/react";
import type { CmssyNextConfig } from "./config";
import { resolveSeoBaseUrl, type SeoBaseUrlOption } from "./seo-base-url";

export interface CreateCmssySitemapOptions extends SeoBaseUrlOption {
  /** Extra static entries appended to the generated page list. */
  extra?: MetadataRoute.Sitemap;
  /**
   * Page slugs to omit (e.g. the 404 content page). Defaults to the reserved
   * not-found slugs so a published 404 page is never advertised as indexable.
   */
  excludeSlugs?: string[];
}

const DEFAULT_EXCLUDED_SLUGS = ["/not-found", "/404"];

function localizedPath(
  slug: string,
  locale: string,
  defaultLocale: string,
): string {
  const normalized =
    slug === "/" ? "" : slug.startsWith("/") ? slug : `/${slug}`;
  return locale === defaultLocale
    ? normalized || "/"
    : `/${locale}${normalized}`;
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

    const baseUrl = await resolveSeoBaseUrl(config, options.baseUrl);
    const defaultLocale = config.defaultLocale ?? "en";
    const locales =
      config.enabledLocales && config.enabledLocales.length > 0
        ? config.enabledLocales
        : [defaultLocale];

    const excluded = new Set(options.excludeSlugs ?? DEFAULT_EXCLUDED_SLUGS);
    const entries: MetadataRoute.Sitemap = pages
      .filter((page) => !excluded.has(page.slug))
      .map((page) => {
        const lastModified = page.updatedAt ?? page.publishedAt ?? undefined;
        const entry: MetadataRoute.Sitemap[number] = {
          url: `${baseUrl}${localizedPath(page.slug, defaultLocale, defaultLocale)}`,
          ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
        };
        if (locales.length > 1) {
          entry.alternates = {
            languages: Object.fromEntries(
              locales.map((locale) => [
                locale,
                `${baseUrl}${localizedPath(page.slug, locale, defaultLocale)}`,
              ]),
            ),
          };
        }
        return entry;
      });

    return options.extra ? [...entries, ...options.extra] : entries;
  };
}
