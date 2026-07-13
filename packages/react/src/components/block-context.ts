import type {
  CmssyFormDefinition,
  CmssyLocaleContext,
  CmssyBlockMember,
  CmssyBlockAuthContext,
  CmssyBlockWorkspace,
  CmssyBlockContext,
  BuildBlockContextExtra,
} from "@cmssy/types";

// Block-context shapes live in @cmssy/types; re-exported for consumers.
export type {
  CmssyLocaleContext,
  CmssyBlockMember,
  CmssyBlockAuthContext,
  CmssyBlockWorkspace,
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
  };
}
