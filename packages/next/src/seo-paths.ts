/**
 * Resolve the default locale and the full locale list from the SDK config,
 * falling back to the workspace site config (defaultLanguage / enabledLanguages)
 * then "en". Shared by sitemap + metadata so their hreflang/canonical agree.
 */
export function resolveSeoLocales(
  config: { defaultLocale?: string; enabledLocales?: string[] },
  siteConfig: {
    defaultLanguage?: string | null;
    enabledLanguages?: string[];
  } | null,
): { defaultLocale: string; locales: string[] } {
  const defaultLocale =
    config.defaultLocale ?? siteConfig?.defaultLanguage ?? "en";
  const locales =
    config.enabledLocales && config.enabledLocales.length > 0
      ? config.enabledLocales
      : siteConfig?.enabledLanguages && siteConfig.enabledLanguages.length > 0
        ? siteConfig.enabledLanguages
        : [defaultLocale];
  return { defaultLocale, locales };
}

/** Ensure a leading slash so comparisons and URLs are stable. "/" stays "/". */
export function normalizeSlug(slug: string): string {
  if (slug === "/" || slug === "") return "/";
  return slug.startsWith("/") ? slug : `/${slug}`;
}

/**
 * Maps a page slug to its path for a locale: the default locale gets no
 * prefix, others get `/${locale}`. The homepage ("/") stays "/" (or "/${locale}").
 */
export function localizedPath(
  slug: string,
  locale: string,
  defaultLocale: string,
): string {
  const normalized = normalizeSlug(slug);
  const base = normalized === "/" ? "" : normalized;
  return locale === defaultLocale ? base || "/" : `/${locale}${base}`;
}
