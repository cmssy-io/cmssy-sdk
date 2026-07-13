import {
  resolveSiteLocales,
  splitLocaleFromPath,
  type CmssyClientConfig,
} from "@cmssy/react";

export const CMSSY_LOCALE_HEADER = "x-cmssy-locale";

export async function localeForPathname(
  config: CmssyClientConfig,
  pathname: string,
): Promise<string> {
  const siteLocales = await resolveSiteLocales(config);
  const segments = pathname.split("/").filter(Boolean);
  return splitLocaleFromPath(segments, siteLocales).locale;
}

export async function splitCmssyLocale(
  config: CmssyClientConfig,
  path: string[] | undefined,
): Promise<{ locale: string; path: string[] | undefined }> {
  const siteLocales = await resolveSiteLocales(config);
  return splitLocaleFromPath(path, siteLocales);
}

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
    const siteLocales = await resolveSiteLocales(config);
    const segments = Array.isArray(options.path)
      ? options.path.filter(Boolean)
      : options.path.split("/").filter(Boolean);
    return splitLocaleFromPath(segments, siteLocales).locale;
  }
  const { headers } = await import("next/headers");
  const headerList = await headers();
  const fromHeader = headerList.get(CMSSY_LOCALE_HEADER);
  if (fromHeader) return fromHeader;
  const { defaultLocale } = await resolveSiteLocales(config);
  return defaultLocale;
}
