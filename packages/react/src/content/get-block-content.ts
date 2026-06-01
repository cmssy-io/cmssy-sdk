function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeLocaleKey(key: string): boolean {
  return /^[a-z]{2}(-[A-Za-z]{2})?$/.test(key);
}

export function getBlockContentForLanguage(
  content: unknown,
  locale: string,
  defaultLocale = "en",
  availableLocales?: string[],
): Record<string, unknown> {
  if (!isPlainObject(content)) return {};

  const isLocale = availableLocales
    ? (key: string) => availableLocales.includes(key)
    : looksLikeLocaleKey;

  const localeEntries = Object.entries(content).filter(
    ([key, value]) => isLocale(key) && isPlainObject(value),
  );
  if (localeEntries.length === 0) return { ...content };

  const localeMap = Object.fromEntries(localeEntries) as Record<
    string,
    Record<string, unknown>
  >;
  const nonTranslatable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    if (!(isLocale(key) && isPlainObject(value))) nonTranslatable[key] = value;
  }

  const fallbackKey = Object.keys(localeMap)[0]!;
  const chosen =
    localeMap[locale] ?? localeMap[defaultLocale] ?? localeMap[fallbackKey]!;

  return { ...nonTranslatable, ...chosen };
}
