import { NextResponse, type NextRequest } from "next/server";
import { resolveSiteLocales, splitLocaleFromPath } from "@cmssy/react";
import type { CmssyConfig } from "@cmssy/core";
import { CMSSY_LOCALE_HEADER } from "@cmssy/core";

/**
 * Resolves the active locale from a pathname's leading segment, against the
 * workspace locales (fetched, cached 60s).
 */
export async function resolveLocaleFromPathname(
  config: CmssyConfig,
  pathname: string,
): Promise<string> {
  const segments = pathname.split("/").filter(Boolean);
  const siteLocales = await resolveSiteLocales({
    apiUrl: config.apiUrl,
    org: config.org,
    workspaceSlug: config.workspaceSlug,
  });
  return splitLocaleFromPath(segments, siteLocales).locale;
}

/**
 * Middleware that derives the locale from the URL path prefix and forwards it as
 * the `x-cmssy-locale` request header, so server components that can't read the
 * path (root layout) resolve the right locale via `getCmssyLocale`.
 */
export function createCmssyLocaleMiddleware(config: CmssyConfig) {
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
