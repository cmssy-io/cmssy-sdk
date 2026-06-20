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
  const protocol =
    host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https";
  return `${protocol}://${host}`;
}
