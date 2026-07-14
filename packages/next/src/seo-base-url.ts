import type { CmssyConfig } from "@cmssy/core";

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
  config: CmssyConfig,
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
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "::1"
  ) {
    return true;
  }
  // Private/loopback IPv4 ranges — anchored to a full dotted-quad so a
  // hostname like "10.example.com" is not mistaken for an IP.
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return (
    a === 127 ||
    a === 0 ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31)
  );
}
