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

export async function getCmssyLocale(
  config: CmssyClientConfig,
): Promise<string> {
  const { headers } = await import("next/headers");
  const headerList = await headers();
  const fromHeader = headerList.get(CMSSY_LOCALE_HEADER);
  if (fromHeader) return fromHeader;
  const { defaultLocale } = await resolveSiteLocales(config);
  return defaultLocale;
}
