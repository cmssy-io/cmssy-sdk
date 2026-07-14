import type { CmssyClientConfig } from "./content/content-client";
import { resolveSiteLocales, splitLocaleFromPath } from "./data/site-locales";

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
 * Resolve the locale a path asks for. The prefix IS the language, so a routed
 * path is all it takes - no request, no headers, static-safe.
 */
export async function localeForPath(
  config: CmssyClientConfig,
  path: string | string[],
): Promise<string> {
  const siteLocales = await resolveSiteLocales(config);
  const segments = Array.isArray(path)
    ? path.filter(Boolean)
    : path.split("/").filter(Boolean);
  return splitLocaleFromPath(segments, siteLocales).locale;
}
