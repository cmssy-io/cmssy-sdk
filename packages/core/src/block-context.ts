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

// Block-context shapes live in @cmssy/types; re-exported for consumers.
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
    // Identity only, and only when the page has one. A page fetched by an older
    // SDK has no slug, and then a block gets no `page` at all rather than one
    // with a hole in it: "I don't know where I am" has to stay distinguishable
    // from "I am at /".
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
