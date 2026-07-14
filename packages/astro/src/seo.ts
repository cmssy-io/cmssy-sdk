import {
  fetchPages,
  localizedPath,
  normalizeSlug,
  resolveSiteLocales,
  type CmssyConfig,
} from "@cmssy/core";

export interface CmssySitemapEntry {
  url: string;
  lastModified?: string;
}

export interface CmssySitemapOptions {
  /**
   * Records are not pages, so the sitemap cannot know about your products or
   * categories. Add them here; you get the same base URL and locales the page
   * entries use, so the two cannot disagree.
   */
  extra?: (context: {
    baseUrl: string;
    defaultLocale: string;
    locales: string[];
  }) => Promise<CmssySitemapEntry[]> | CmssySitemapEntry[];
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function baseUrlFor(config: CmssyConfig, url: URL): Promise<string> {
  return (config.siteUrl ?? url.origin).replace(/\/+$/, "");
}

/**
 * One `<url>` per language, plus x-default - a translated page is not a
 * duplicate, and telling Google it is keeps the translation out of the index.
 */
export function createCmssySitemap(
  config: CmssyConfig,
  options: CmssySitemapOptions = {},
) {
  return async function GET({ url }: { url: URL }): Promise<Response> {
    const baseUrl = await baseUrlFor(config, url);
    const { defaultLocale, locales } = await resolveSiteLocales(config);

    const pages = await fetchPages(config);
    const entries: CmssySitemapEntry[] = [];

    for (const page of pages) {
      const slug = normalizeSlug(page.slug);
      for (const locale of locales) {
        entries.push({
          url: `${baseUrl}${localizedPath(slug, locale, defaultLocale)}`,
          lastModified: page.updatedAt ?? undefined,
        });
      }
    }

    if (options.extra) {
      entries.push(
        ...(await options.extra({
          baseUrl,
          defaultLocale,
          locales,
        })),
      );
    }

    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries.map((entry) =>
        [
          "  <url>",
          `    <loc>${xmlEscape(entry.url)}</loc>`,
          entry.lastModified
            ? `    <lastmod>${xmlEscape(entry.lastModified)}</lastmod>`
            : "",
          "  </url>",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
      "</urlset>",
    ].join("\n");

    return new Response(body, {
      headers: { "content-type": "application/xml" },
    });
  };
}

export function createCmssyRobots(config: CmssyConfig) {
  return async function GET({ url }: { url: URL }): Promise<Response> {
    const baseUrl = await baseUrlFor(config, url);
    const body = [
      "User-agent: *",
      "Allow: /",
      "Disallow: /cmssy-edit",
      `Sitemap: ${baseUrl}/sitemap.xml`,
      "",
    ].join("\n");

    return new Response(body, { headers: { "content-type": "text/plain" } });
  };
}
