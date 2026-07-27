import { NextResponse, type NextRequest } from "next/server";
import { resolveSiteLocales } from "@cmssy/core/internal/locale";
import type { CmssyConfig } from "@cmssy/core";
import { applyCmssyCsp } from "@cmssy/core";
import { CMSSY_EDIT_HEADER } from "@cmssy/core";
import { cmssyEditRewrite } from "../edit-middleware";
import { CMSSY_LOCALE_HEADER, localeForPathname } from "@cmssy/core/internal/locale";

/** A cookie the proxy writes on this request. An empty value deletes it. */
export interface CmssyProxyCookie {
  name: string;
  value: string;
  /** Passed to `response.cookies.set`; defaults to httpOnly + sameSite lax. */
  options?: Omit<Parameters<NextResponse["cookies"]["set"]>[2], "name" | "value">;
}

export interface CmssyProxyOptions {
  /**
   * Strip the language prefix before the app sees it, so static routes like
   * `/shop/cart` serve `/no/shop/cart` too. Leave it off for a catch-all app
   * that reads the language off the path itself.
   */
  stripLocalePrefix?: boolean;
  /**
   * Cookies this request has to write - a refreshed session, a freshly minted
   * cart id. They are set on the response AND merged into the cookie header the
   * app is about to be rendered with, so THIS render already sees them; setting
   * them on the response alone means the value only arrives on the next
   * navigation, which is how a signed-in visitor renders signed-out once.
   *
   * It is the escape hatch that keeps an app from re-implementing the whole
   * preset - locale, edit rewrite and CSP included - to add one cookie.
   */
  cookies?: (
    request: NextRequest,
  ) => Promise<CmssyProxyCookie[]> | CmssyProxyCookie[];
}

const DEFAULT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/** The forwarded `cookie` header with these writes applied, so the render sees them. */
function mergeCookieHeader(
  header: string | null,
  writes: CmssyProxyCookie[],
): string {
  const written = new Set(writes.map((write) => write.name));
  const kept = (header ?? "")
    .split(/; */)
    .filter(Boolean)
    .filter((cookie) => !written.has(cookie.split("=")[0] ?? ""));
  const added = writes
    .filter((write) => write.value)
    .map((write) => `${write.name}=${write.value}`);
  return [...kept, ...added].join("; ");
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
  config: CmssyConfig,
  options: CmssyProxyOptions = {},
) {
  return async function cmssyProxy(request: NextRequest): Promise<NextResponse> {
    const { pathname } = request.nextUrl;

    const requestHeaders = new Headers(request.headers);
    // Strip both first: a client must not be able to forge either.
    requestHeaders.delete(CMSSY_EDIT_HEADER);
    requestHeaders.delete(CMSSY_LOCALE_HEADER);

    const writes = (await options.cookies?.(request)) ?? [];
    if (writes.length > 0) {
      requestHeaders.set(
        "cookie",
        mergeCookieHeader(requestHeaders.get("cookie"), writes),
      );
    }
    const persist = <T extends NextResponse>(response: T): T => {
      for (const write of writes) {
        response.cookies.set(write.name, write.value, {
          ...DEFAULT_COOKIE_OPTIONS,
          ...(write.value ? {} : { maxAge: 0 }),
          ...write.options,
        });
      }
      return response;
    };

    const locale = await localeForPathname(config, pathname);
    requestHeaders.set(CMSSY_LOCALE_HEADER, locale);

    const editHeaders = new Headers(requestHeaders);
    editHeaders.set(CMSSY_EDIT_HEADER, "1");
    const editRewrite = await cmssyEditRewrite(request, config, {
      requestHeaders: editHeaders,
    });
    if (editRewrite) {
      applyCmssyCsp(editRewrite, { editorOrigin: config.editorOrigin });
      return persist(editRewrite);
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
        return persist(
          NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
        );
      }
    }

    return persist(NextResponse.next({ request: { headers: requestHeaders } }));
  };
}

/**
 * The matcher a cmssy app wants: everything except Next internals, API routes
 * and files with an extension.
 *
 * Next parses `export const config` at COMPILE time, so it rejects an imported
 * constant - copy this value into your proxy literally:
 *
 *   export const config = { matcher: ["/((?!_next/|api/|.*\\..*).*)"] };
 */
export const cmssyProxyMatcher = ["/((?!_next/|api/|.*\\..*).*)"];
