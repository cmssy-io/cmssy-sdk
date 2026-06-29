import type { CmssyFormDefinition } from "../data/queries";

export interface CmssyLocaleContext {
  current: string;
  default: string;
  enabled: string[];
}

export interface CmssyBlockMember {
  recordId: string;
  email: string;
}

export interface CmssyBlockAuthContext {
  isAuthenticated: boolean;
  member: CmssyBlockMember | null;
}

export interface CmssyBlockWorkspace {
  id: string;
  slug: string;
}

export interface CmssyBlockContext {
  locale: CmssyLocaleContext;
  isPreview: boolean;
  forms?: Record<string, CmssyFormDefinition>;
  auth?: CmssyBlockAuthContext;
  workspace?: CmssyBlockWorkspace;
}

export interface BuildBlockContextExtra {
  auth?: CmssyBlockAuthContext;
  workspace?: CmssyBlockWorkspace;
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
  };
}
