import {
  CMSSY_EDIT_QUERY_PARAM,
  CMSSY_LOCALE_HEADER,
  CMSSY_SECRET_QUERY_PARAM,
  cmssyCspHeaders,
  fetchLayouts,
  fetchPage,
  isDevelopment,
  isVerifiedEditUrl,
  resolveSiteLocales,
  splitLocaleFromPath,
  type CmssyConfig,
  type CmssyLayoutGroup,
  type CmssyPageData,
} from "@cmssy/core";

export interface CmssyRouteData {
  page: CmssyPageData | null;
  layouts: CmssyLayoutGroup[];
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  /** True for a VERIFIED editor request. The route renders the edit bridge. */
  isEdit: boolean;
  editorOrigin: string | string[];
  diagnostics?: string;
}

/**
 * The page loader.
 *
 * Note what is NOT here: the `/cmssy-edit` route the Next adapter needs. That
 * route exists because a Next page can be STATIC, and a static page never sees
 * the query string that would put it in edit mode. React Router renders on every
 * request, so the editor can be served from the page itself - verified the same
 * way, on the same protocol, with less machinery.
 */
export function createCmssyLoader(config: CmssyConfig) {
  return async function cmssyLoader({
    request,
  }: {
    request: Request;
  }): Promise<CmssyRouteData> {
    const url = new URL(request.url);
    const isEdit = await isVerifiedEditUrl(url, config);

    const editRequested = url.searchParams
      .getAll(CMSSY_EDIT_QUERY_PARAM)
      .includes("1");
    if (!isEdit && editRequested && isDevelopment()) {
      const { collectEditDiagnostics, renderEditDiagnostics } = await import(
        "@cmssy/core/preflight"
      );
      const diagnosed = await collectEditDiagnostics({
        config,
        providedSecret: url.searchParams.get(CMSSY_SECRET_QUERY_PARAM),
        devOrigin: url.origin,
      });
      const locales = await resolveSiteLocales(config);
      return {
        page: null,
        layouts: [],
        locale: locales.defaultLocale,
        defaultLocale: locales.defaultLocale,
        enabledLocales: locales.locales,
        isEdit: false,
        editorOrigin: config.editorOrigin ?? "*",
        diagnostics: renderEditDiagnostics(diagnosed),
      };
    }

    const siteLocales = await resolveSiteLocales(config);
    const segments = url.pathname.split("/").filter(Boolean);
    const fromPath = splitLocaleFromPath(segments, siteLocales);
    const locale = request.headers.get(CMSSY_LOCALE_HEADER) ?? fromPath.locale;

    const previewSecret = isEdit ? config.draftSecret : undefined;
    const [page, layouts] = await Promise.all([
      fetchPage(config, fromPath.path, { previewSecret }),
      fetchLayouts(config, fromPath.path, { previewSecret }),
    ]);

    return {
      page,
      layouts,
      locale,
      defaultLocale: siteLocales.defaultLocale,
      enabledLocales: siteLocales.locales,
      isEdit,
      editorOrigin: config.editorOrigin ?? "*",
    };
  };
}

/**
 * The response headers a cmssy page needs: without them the admin cannot frame
 * the site, and the editor shows an empty box with no error anywhere.
 */
export function createCmssyHeaders(config: CmssyConfig) {
  return function cmssyHeaders(): Record<string, string> {
    return cmssyCspHeaders({ editorOrigin: config.editorOrigin });
  };
}
