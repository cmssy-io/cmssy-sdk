import type { MetadataRoute } from "next";
import type { CmssyNextConfig } from "./config";
import { resolveSeoBaseUrl, type SeoBaseUrlOption } from "./seo-base-url";

export interface CreateCmssyRobotsOptions extends SeoBaseUrlOption {
  /** Path prefixes to disallow. Defaults to `["/api/"]`. */
  disallow?: string[];
  /** Override the generated rules entirely. */
  rules?: MetadataRoute.Robots["rules"];
  /** Reference `${baseUrl}/sitemap.xml`. Defaults to true. */
  sitemap?: boolean;
  /**
   * Emit the non-standard `Host:` directive (a Yandex extension). Google
   * ignores it and reports a warning in Search Console, so it is off by
   * default. Enable only when targeting Yandex.
   */
  host?: boolean;
}

/**
 * Builds the default export for Next's `app/robots.ts`. Allows crawling and
 * points to the sitemap. Drop in as:
 *
 *   export default createCmssyRobots(cmssy);
 */
export function createCmssyRobots(
  config: CmssyNextConfig,
  options: CreateCmssyRobotsOptions = {},
) {
  return async function robots(): Promise<MetadataRoute.Robots> {
    const baseUrl = await resolveSeoBaseUrl(config, options.baseUrl);
    const rules =
      options.rules ??
      ({
        userAgent: "*",
        allow: "/",
        disallow: options.disallow ?? ["/api/"],
      } satisfies MetadataRoute.Robots["rules"]);

    const includeSitemap = options.sitemap !== false && Boolean(baseUrl);
    return {
      rules,
      ...(includeSitemap ? { sitemap: `${baseUrl}/sitemap.xml` } : {}),
      ...(options.host && baseUrl ? { host: baseUrl } : {}),
    };
  };
}
