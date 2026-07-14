import {
  CMSSY_EDIT_HEADER,
  CMSSY_LOCALE_HEADER,
  applyCmssyCsp,
  isVerifiedEditUrl,
  localeForPathname,
  resolveSiteLocales,
  type CmssyConfig,
} from "@cmssy/core";

export const CMSSY_EDIT_PATH_PREFIX = "/cmssy-edit";

export interface CmssyMiddlewareOptions {
  /**
   * Strip the language prefix before the app sees it, so a static route like
   * `/shop` serves `/no/shop` too. Leave it off for a catch-all app that reads
   * the language off the path itself.
   */
  stripLocalePrefix?: boolean;
}

interface AstroContextLike {
  url: URL;
  request: Request;
  rewrite: (path: string) => Promise<Response> | Response;
}

/**
 * The whole middleware a cmssy Astro app needs, in the order it has to happen:
 *
 *   1. resolve the language and pass it on;
 *   2. send a VERIFIED editor request to /cmssy-edit, carrying that language and
 *      the edit flag - a prerendered page never sees the query string that would
 *      put it in edit mode;
 *   3. strip the language prefix for everything else, if asked.
 *
 * The order is not a detail. Resolve the locale after the rewrite and the editor
 * preview renders in the wrong language; drop the edit flag and the header and
 * footer become markup the editor can select but not fill. Both mistakes shipped
 * in the Next app before this sequence existed - Astro gets it right the first
 * time by reusing it.
 */
export function cmssyMiddleware(
  config: CmssyConfig,
  options: CmssyMiddlewareOptions = {},
) {
  return async function onRequest(
    context: AstroContextLike,
    next: () => Promise<Response>,
  ): Promise<Response> {
    const { pathname } = context.url;

    // Strip both first: a client must never be able to forge either.
    context.request.headers.delete(CMSSY_EDIT_HEADER);
    context.request.headers.delete(CMSSY_LOCALE_HEADER);

    const locale = await localeForPathname(config, pathname);
    context.request.headers.set(CMSSY_LOCALE_HEADER, locale);

    if (
      !pathname.startsWith(CMSSY_EDIT_PATH_PREFIX) &&
      (await isVerifiedEditUrl(context.url, config))
    ) {
      context.request.headers.set(CMSSY_EDIT_HEADER, "1");
      const target = `${CMSSY_EDIT_PATH_PREFIX}${
        pathname === "/" ? "" : pathname
      }${context.url.search}`;
      const response = await context.rewrite(target);
      applyCmssyCsp(response, { editorOrigin: config.editorOrigin });
      return response;
    }

    if (options.stripLocalePrefix && pathname.startsWith(`/${locale}`)) {
      const { defaultLocale } = await resolveSiteLocales(config);
      if (locale !== defaultLocale) {
        const stripped = pathname.slice(locale.length + 1) || "/";
        return context.rewrite(`${stripped}${context.url.search}`);
      }
    }

    return next();
  };
}
