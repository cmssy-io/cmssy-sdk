import {
  CMSSY_EDIT_QUERY_PARAM,
  CMSSY_SECRET_QUERY_PARAM,
  isVerifiedEditUrl,
  type CmssyConfig,
  type CmssyLayoutGroup,
  type CmssyPageData,
} from "@cmssy/core";
import {
  CMSSY_LOCALE_HEADER,
  cmssyCspHeaders,
  fetchPage,
  isDevelopment,
  resolveSiteLocales,
} from "@cmssy/core/internal";
import {
  resolveCmssyLayoutSlot,
  type BlockDefinition,
} from "@cmssy/react";

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
  /**
   * Edit mode only, and only when `blocks` was passed: what the canvas needs,
   * **keyed by position**. The header and the footer hold different blocks and
   * resolve to different data - handing the footer the header's is the quiet
   * version of this bug.
   */
  editorData?: Record<string, CmssyLayoutEditorData>;
}

export interface CmssyLayoutEditorData {
  data: Record<string, unknown>;
  resolvedContent: Record<string, Record<string, unknown>>;
}

export interface CreateCmssyLoaderOptions {
  /**
   * The block registry. Required to resolve the editor's layout data; omit it
   * and the layouts still render, but the editor cannot fill them.
   */
  blocks?: BlockDefinition[];
  /** Which positions the editor renders. Defaults to the header and footer. */
  positions?: string[];
  appContext?: Record<string, unknown>;
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
export function createCmssyLoader(
  config: CmssyConfig,
  options: CreateCmssyLoaderOptions = {},
) {
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

    const segments = url.pathname.split("/").filter(Boolean);

    const positions = options.positions ?? ["header", "footer"];
    const blocks = options.blocks ?? [];
    // Always-dynamic routes, so the middleware's header is readable here and
    // keeps the preference it has always had. The resolver reads no headers.
    const headerLocale = request.headers.get(CMSSY_LOCALE_HEADER) ?? undefined;

    const slot = await resolveCmssyLayoutSlot(config, {
      position: positions[0] ?? "header",
      blocks,
      editMode: isEdit,
      path: segments,
      locale: headerLocale,
      appContext: options.appContext,
    });

    const page = await fetchPage(config, slot.path, {
      previewSecret: isEdit ? config.draftSecret : undefined,
    });

    let editorData: Record<string, CmssyLayoutEditorData> | undefined;
    if (isEdit && slot.data && slot.resolvedContent) {
      editorData = {
        [positions[0] ?? "header"]: {
          data: slot.data,
          resolvedContent: slot.resolvedContent,
        },
      };
      // Each position resolves its own blocks. One call per position, in edit
      // mode only - the published render needs none of this.
      for (const position of positions.slice(1)) {
        const extra = await resolveCmssyLayoutSlot(config, {
          position,
          blocks,
          editMode: true,
          path: segments,
          locale: headerLocale,
          appContext: options.appContext,
        });
        if (extra.data && extra.resolvedContent) {
          editorData[position] = {
            data: extra.data,
            resolvedContent: extra.resolvedContent,
          };
        }
      }
    }

    return {
      page,
      layouts: slot.groups,
      locale: slot.locale,
      defaultLocale: slot.defaultLocale,
      enabledLocales: slot.enabledLocales,
      isEdit,
      editorOrigin: config.editorOrigin ?? "*",
      editorData,
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
