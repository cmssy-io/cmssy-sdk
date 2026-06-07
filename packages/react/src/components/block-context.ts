import type { CmssyFormDefinition } from "../data/queries";

export interface CmssyLocaleContext {
  current: string;
  default: string;
  enabled: string[];
}

export interface CmssyBlockContext {
  locale: CmssyLocaleContext;
  isPreview: boolean;
  forms?: Record<string, CmssyFormDefinition>;
}

export function buildBlockContext(
  locale: string,
  defaultLocale: string,
  enabledLocales?: string[],
  isPreview?: boolean,
  forms?: Record<string, CmssyFormDefinition>,
): CmssyBlockContext {
  return {
    locale: {
      current: locale,
      default: defaultLocale,
      enabled:
        enabledLocales && enabledLocales.length > 0
          ? enabledLocales
          : Array.from(new Set([defaultLocale, locale])),
    },
    isPreview: isPreview ?? false,
    forms,
  };
}
