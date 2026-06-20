import type { CmssyNextConfig } from "./config";

export interface SeoBaseUrlOption {
  /**
   * Override for the canonical origin. A string (e.g. https://cmssy.com) or a
   * resolver. Falls back to `config.siteUrl`, then the request `host` header.
   */
  baseUrl?: string | (() => string | Promise<string>);
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function resolveSeoBaseUrl(
  config: CmssyNextConfig,
  option?: SeoBaseUrlOption["baseUrl"],
): Promise<string> {
  if (typeof option === "function") return trimTrailingSlash(await option());
  if (typeof option === "string" && option) return trimTrailingSlash(option);
  if (config.siteUrl) return trimTrailingSlash(config.siteUrl);

  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("host");
  if (!host) return "";
  const protocol = isLocalHost(host) ? "http" : "https";
  return `${protocol}://${host}`;
}

/** Local/dev hosts that should be addressed over http, not https. */
function isLocalHost(host: string): boolean {
  const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}
