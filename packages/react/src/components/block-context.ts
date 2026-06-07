export interface CmssyLocaleContext {
  current: string;
  default: string;
  enabled: string[];
}

export interface CmssyBlockContext {
  locale?: CmssyLocaleContext;
  isPreview?: boolean;
}

export function buildBlockContext(
  locale: string,
  defaultLocale: string,
  enabledLocales?: string[],
  isPreview?: boolean,
): CmssyBlockContext {
  return {
    locale: {
      current: locale,
      default: defaultLocale,
      enabled:
        enabledLocales && enabledLocales.length > 0
          ? enabledLocales
          : [defaultLocale],
    },
    isPreview: isPreview ?? false,
  };
}
