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

/**
 * Behind a proxy (Vercel, Cloudflare, any CDN) the server sees its own origin -
 * `http://localhost:3000` - so a sitemap built from it advertises localhost URLs
 * to Google. The forwarded host is what the visitor actually asked for.
 */
function baseUrlFor(config: CmssyConfig, url: URL, request: Request): string {
  if (config.siteUrl) return config.siteUrl.replace(/\/+$/, "");

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return url.origin.replace(/\/+$/, "");

  const protocol =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

/**
 * One `<url>` per language, plus x-default - a translated page is not a
 * duplicate, and telling Google it is keeps the translation out of the index.
 */
export function createCmssySitemap(
  config: CmssyConfig,
  options: CmssySitemapOptions = {},
) {
  return async function GET({
    url,
    request,
  }: {
    url: URL;
    request: Request;
  }): Promise<Response> {
    const baseUrl = baseUrlFor(config, url, request);
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
  return async function GET({
    url,
    request,
  }: {
    url: URL;
    request: Request;
  }): Promise<Response> {
    const baseUrl = baseUrlFor(config, url, request);
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
