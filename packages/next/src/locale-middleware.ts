import { NextResponse, type NextRequest } from "next/server";
import {
  resolveSiteLocales,
  splitLocaleFromPath,
  type CmssySiteLocales,
} from "@cmssy/react";
import type { CmssyNextConfig } from "./config";
import { CMSSY_LOCALE_HEADER } from "./locale";

/**
 * Resolves the active locale from a pathname's leading segment. Uses the
 * config's static `defaultLocale` + `enabledLocales` when both are set (no
 * network); otherwise fetches the workspace locales (cached).
 */
export async function resolveLocaleFromPathname(
  config: CmssyNextConfig,
  pathname: string,
): Promise<string> {
  const segments = pathname.split("/").filter(Boolean);
  const hasStaticLocales = !!config.enabledLocales?.length;
  // Mirror createCmssyPage: config.defaultLocale / config.enabledLocales each
  // override the fetched workspace value independently. Skip the fetch only when
  // both are statically configured.
  const fetched =
    config.defaultLocale && hasStaticLocales
      ? null
      : await resolveSiteLocales({
          apiUrl: config.apiUrl,
          workspaceSlug: config.workspaceSlug,
        });
  const siteLocales: CmssySiteLocales = {
    defaultLocale: config.defaultLocale ?? fetched!.defaultLocale,
    locales: hasStaticLocales ? config.enabledLocales! : fetched!.locales,
  };
  return splitLocaleFromPath(segments, siteLocales).locale;
}

/**
 * Middleware that derives the locale from the URL path prefix and forwards it as
 * the `x-cmssy-locale` request header, so server components that can't read the
 * path (root layout) resolve the right locale via `getCmssyLocale`.
 */
export function createCmssyLocaleMiddleware(config: CmssyNextConfig) {
  return async function cmssyLocaleMiddleware(
    request: NextRequest,
  ): Promise<NextResponse> {
    const locale = await resolveLocaleFromPathname(
      config,
      request.nextUrl.pathname,
    );
    const headers = new Headers(request.headers);
    headers.set(CMSSY_LOCALE_HEADER, locale);
    return NextResponse.next({ request: { headers } });
  };
}
