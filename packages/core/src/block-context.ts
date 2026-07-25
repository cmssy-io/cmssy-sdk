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

/**
 * The identity half of a fetched page, for `context.page`.
 *
 * A page fetched by an older SDK - or by a consumer that builds `CmssyPageData`
 * itself - has no slug, and then a block gets no `page` at all rather than one
 * with a hole in it: `context.page ? … : …` is a question a block can answer.
 */
export function blockPageOf(
  page: CmssyPageData | null | undefined,
): CmssyBlockPage | undefined {
  if (!page?.slug) return undefined;
  return {
    id: page.id,
    slug: page.slug,
    pageType: page.pageType ?? null,
  };
}

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
    ...(extra?.page ? { page: extra.page } : {}),
  };
}
