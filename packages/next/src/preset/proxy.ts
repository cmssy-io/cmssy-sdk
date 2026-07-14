import { NextResponse, type NextRequest } from "next/server";
import { resolveSiteLocales } from "@cmssy/react";
import type { CmssyNextConfig } from "../config";
import { applyCmssyCsp } from "../csp";
import { CMSSY_EDIT_HEADER } from "../edit-mode";
import { cmssyEditRewrite } from "../edit-middleware";
import { CMSSY_LOCALE_HEADER, localeForPathname } from "../locale";

export interface CmssyProxyOptions {
  /**
   * Strip the language prefix before the app sees it, so static routes like
   * `/shop/cart` serve `/no/shop/cart` too. Leave it off for a catch-all app
   * that reads the language off the path itself.
   */
  stripLocalePrefix?: boolean;
}

/**
 * The whole middleware a cmssy app needs, in the order it has to happen:
 *
 *   1. resolve the language and pass it on (a route cannot read the prefix it
 *      never sees);
 *   2. send a VERIFIED editor request to /cmssy-edit, carrying that language and
 *      the edit flag - the public pages are static, and a static page never sees
 *      the query string that would put it in edit mode;
 *   3. strip the language prefix for everything else, if asked.
 *
 * The order is not a detail: resolve the locale after the rewrite and the editor
 * preview renders in the wrong language; forget the edit flag and the header and
 * footer become markup the editor can select but not fill. Both mistakes shipped
 * before this existed.
 */
export function createCmssyProxy(
  config: CmssyNextConfig,
  options: CmssyProxyOptions = {},
) {
  return async function cmssyProxy(request: NextRequest): Promise<NextResponse> {
    const { pathname } = request.nextUrl;

    const requestHeaders = new Headers(request.headers);
    // Strip both first: a client must not be able to forge either.
    requestHeaders.delete(CMSSY_EDIT_HEADER);
    requestHeaders.delete(CMSSY_LOCALE_HEADER);

    const locale = await localeForPathname(config, pathname);
    requestHeaders.set(CMSSY_LOCALE_HEADER, locale);

    const editHeaders = new Headers(requestHeaders);
    editHeaders.set(CMSSY_EDIT_HEADER, "1");
    const editRewrite = await cmssyEditRewrite(request, config, {
      requestHeaders: editHeaders,
    });
    if (editRewrite) {
      applyCmssyCsp(editRewrite, { editorOrigin: config.editorOrigin });
      return editRewrite;
    }

    if (options.stripLocalePrefix && pathname.startsWith(`/${locale}`)) {
      // The workspace says which language needs no prefix - assuming "en" is how
      // a Norwegian-first site ends up prefixing every one of its URLs.
      const { defaultLocale } = await resolveSiteLocales(config);
      if (locale !== defaultLocale) {
        // Clone rather than build a URL from the pathname: the query string
        // carries the app's own params.
        const url = request.nextUrl.clone();
        url.pathname = pathname.slice(locale.length + 1) || "/";
        return NextResponse.rewrite(url, {
          request: { headers: requestHeaders },
        });
      }
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
  };
}

/** The matcher a cmssy app wants: everything except Next internals, API routes
 *  and files with an extension. */
export const cmssyProxyMatcher = ["/((?!_next/|api/|.*\\..*).*)"];
