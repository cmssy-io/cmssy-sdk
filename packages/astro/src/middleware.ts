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

const withoutDuplicateSlashes = (pathname: string) =>
  pathname.replace(/\/{2,}/g, "/") || "/";

export interface CmssyMiddlewareOptions {
  stripLocalePrefix?: boolean;
}

interface AstroContextLike {
  url: URL;
  request: Request;
}

type CmssyNext = (
  payload?: string | URL | Request,
) => Promise<Response> | Response;

export function cmssyMiddleware(
  config: CmssyConfig,
  options: CmssyMiddlewareOptions = {},
) {
  return async function onRequest(
    context: AstroContextLike,
    next: CmssyNext,
  ): Promise<Response> {
    const { pathname } = context.url;

    context.request.headers.delete(CMSSY_EDIT_HEADER);
    context.request.headers.delete(CMSSY_LOCALE_HEADER);

    const underEditRoute =
      pathname === CMSSY_EDIT_PATH_PREFIX ||
      pathname.startsWith(`${CMSSY_EDIT_PATH_PREFIX}/`);

    const locale = await localeForPathname(
      config,
      underEditRoute
        ? pathname.slice(CMSSY_EDIT_PATH_PREFIX.length) || "/"
        : pathname,
    );
    context.request.headers.set(CMSSY_LOCALE_HEADER, locale);

    const editRequested = context.url.searchParams
      .getAll(CMSSY_EDIT_QUERY_PARAM)
      .includes("1");

    if (editRequested) {
      const verified = await isVerifiedEditUrl(context.url, config);
      if (verified) {
        context.request.headers.set(CMSSY_EDIT_HEADER, "1");
      }
      if (verified && !underEditRoute) {
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

    if (underEditRoute) {
      const response = await next();
      try {
        applyCmssyCsp(response, { editorOrigin: config.editorOrigin });
      } catch {
        response.headers.set(
          "content-security-policy",
          "frame-ancestors 'none'",
        );
        response.headers.set("x-frame-options", "DENY");
      }
      return response;
    }

    return next();
  };
}
