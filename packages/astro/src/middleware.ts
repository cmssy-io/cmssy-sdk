import {
  CMSSY_EDIT_HEADER,
  CMSSY_EDIT_QUERY_PARAM,
  CMSSY_SECRET_QUERY_PARAM,
  applyCmssyCsp,
  isVerifiedEditUrl,
  type CmssyConfig,
} from "@cmssy/core";
import {
  CMSSY_LOCALE_HEADER,
  isDevelopment,
  localeForPathname,
  resolveSiteLocales,
} from "@cmssy/core/internal";

export const CMSSY_EDIT_PATH_PREFIX = "/cmssy-edit";

/**
 * `//evil.com/x` is protocol-relative: resolved against a base it lands on that
 * origin. Astro collapses this itself only from 6.1.
 */
const withoutDuplicateSlashes = (pathname: string) =>
  pathname.replace(/\/{2,}/g, "/") || "/";

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
}

/**
 * The rewrite payload goes to `next`, not to `context.rewrite`. Both reach
 * `applyRewriteToState`, but `context.rewrite` builds a fresh `AstroMiddleware`
 * and runs this whole chain again on the rewritten URL - where the language
 * prefix it just removed is gone, so a second pass resolved the default
 * language and overwrote the first pass's answer.
 */
type CmssyNext = (
  payload?: string | URL | Request,
) => Promise<Response> | Response;

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
 * in the Next app before this sequence existed.
 */
export function cmssyMiddleware(
  config: CmssyConfig,
  options: CmssyMiddlewareOptions = {},
) {
  return async function onRequest(
    context: AstroContextLike,
    next: CmssyNext,
  ): Promise<Response> {
    const { pathname } = context.url;

    // Strip both first: a client must never be able to forge either.
    context.request.headers.delete(CMSSY_EDIT_HEADER);
    context.request.headers.delete(CMSSY_LOCALE_HEADER);

    const locale = await localeForPathname(config, pathname);
    context.request.headers.set(CMSSY_LOCALE_HEADER, locale);

    const editRequested = context.url.searchParams
      .getAll(CMSSY_EDIT_QUERY_PARAM)
      .includes("1");

    const underEditRoute =
      pathname === CMSSY_EDIT_PATH_PREFIX ||
      pathname.startsWith(`${CMSSY_EDIT_PATH_PREFIX}/`);

    if (editRequested) {
      const verified = await isVerifiedEditUrl(context.url, config);
      if (verified && !underEditRoute) {
        context.request.headers.set(CMSSY_EDIT_HEADER, "1");
        const target = `${CMSSY_EDIT_PATH_PREFIX}${
          pathname === "/" ? "" : pathname
        }${context.url.search}`;
        const response = await next(
          new Request(new URL(target, context.url), context.request),
        );
        applyCmssyCsp(response, { editorOrigin: config.editorOrigin });
        return response;
      }
      if (!verified && isDevelopment()) {
        const { collectEditDiagnostics, renderEditDiagnosticsDocument } =
          await import("@cmssy/core/preflight");
        const diagnostics = await collectEditDiagnostics({
          config,
          providedSecret: context.url.searchParams.get(
            CMSSY_SECRET_QUERY_PARAM,
          ),
          devOrigin: context.url.origin,
        });
        const page = new Response(renderEditDiagnosticsDocument(diagnostics), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
        try {
          applyCmssyCsp(page, { editorOrigin: config.editorOrigin });
        } catch {
          // An editorOrigin too malformed to build a CSP from is one of the
          // things this page reports. Throwing here replaces the explanation
          // with a 500.
        }
        return page;
      }
    }

    const prefix = `/${locale}`;
    const prefixed = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (options.stripLocalePrefix && prefixed) {
      const { defaultLocale } = await resolveSiteLocales(config);
      if (locale !== defaultLocale) {
        const stripped = withoutDuplicateSlashes(pathname.slice(prefix.length));
        return next(`${stripped}${context.url.search}`);
      }
    }

    return next();
  };
}
