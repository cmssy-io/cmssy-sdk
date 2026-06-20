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
