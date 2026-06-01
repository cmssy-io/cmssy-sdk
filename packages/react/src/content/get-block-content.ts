function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getBlockContentForLanguage(
  content: unknown,
  locale: string,
  defaultLocale = "en",
): Record<string, unknown> {
  if (!isPlainObject(content)) return {};

  const localeObjects = Object.values(content).filter(isPlainObject);
  if (localeObjects.length === 0) return content;

  const nonTranslatable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    if (!isPlainObject(value)) nonTranslatable[key] = value;
  }

  const chosen =
    (isPlainObject(content[locale]) ? content[locale] : undefined) ??
    (isPlainObject(content[defaultLocale])
      ? content[defaultLocale]
      : undefined) ??
    localeObjects[0]!;

  return { ...nonTranslatable, ...chosen };
}
