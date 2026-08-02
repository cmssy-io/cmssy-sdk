import type {
  CmssyFormDefinition,
  CmssyLocaleContext,
  CmssyBlockMember,
  CmssyBlockAuthContext,
  CmssyBlockWorkspace,
  CmssyBlockPage,
  CmssyBlockContext,
  CmssyPageData,
  BuildBlockContextExtra,
} from "@cmssy/types";

export type {
  CmssyLocaleContext,
  CmssyBlockMember,
  CmssyBlockAuthContext,
  CmssyBlockWorkspace,
  CmssyBlockPage,
  CmssyBlockContext,
  BuildBlockContextExtra,
};

export function buildBlockContext(
  locale: string,
  defaultLocale: string,
  enabledLocales?: string[],
  isPreview?: boolean,
  forms?: Record<string, CmssyFormDefinition>,
  extra?: BuildBlockContextExtra,
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
    ...(extra?.auth ? { auth: extra.auth } : {}),
    ...(extra?.workspace ? { workspace: extra.workspace } : {}),
    ...(extra?.page?.slug
      ? {
          page: {
            id: extra.page.id,
            slug: extra.page.slug,
            pageType: extra.page.pageType ?? null,
          },
        }
      : {}),
    ...(extra?.app ? { app: extra.app } : {}),
  };
}
