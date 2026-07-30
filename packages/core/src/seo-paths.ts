export function normalizeSlug(slug: string): string {
  if (slug === "/" || slug === "") return "/";
  return slug.startsWith("/") ? slug : `/${slug}`;
}

export function localizedPath(
  slug: string,
  locale: string,
  defaultLocale: string,
): string {
  const normalized = normalizeSlug(slug);
  const base = normalized === "/" ? "" : normalized;
  return locale === defaultLocale ? base || "/" : `/${locale}${base}`;
}
