import {
  CMSSY_LOCALE_HEADER,
  localeForPath,
  resolveSiteLocales,
  type CmssyClientConfig,
} from "@cmssy/core";

/**
 * Resolve the active locale. Pass `options.path` (route params) wherever
 * possible - that path is static-safe. The no-argument form falls back to the
 * `x-cmssy-locale` request header, which reads `headers()` and forces the
 * calling route into dynamic rendering.
 */
export async function getCmssyLocale(
  config: CmssyClientConfig,
  options?: { path?: string | string[] },
): Promise<string> {
  if (options?.path !== undefined) {
    return localeForPath(config, options.path);
  }
  const { headers } = await import("next/headers");
  const headerList = await headers();
  const fromHeader = headerList.get(CMSSY_LOCALE_HEADER);
  if (fromHeader) return fromHeader;
  const { defaultLocale } = await resolveSiteLocales(config);
  return defaultLocale;
}
