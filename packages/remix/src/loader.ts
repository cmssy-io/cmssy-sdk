import {
  CMSSY_EDIT_QUERY_PARAM,
  CMSSY_SECRET_QUERY_PARAM,
  isVerifiedEditUrl,
  resolveEditorOrigin,
  type CmssyConfig,
  type CmssyLayoutGroup,
  type CmssyPageData,
  type LayoutRegion,
  type RetryOption,
} from "@cmssy/core";
import {
  CMSSY_LOCALE_HEADER,
  cmssyCspHeaders,
  fetchPage,
  isDevelopment,
  resolveSiteLocales,
  layoutRegionIds,
} from "@cmssy/core/internal";
import { resolveCmssyLayoutSlot, type BlockDefinition } from "@cmssy/react";

export interface CmssyRouteData {
  page: CmssyPageData | null;
  layouts: CmssyLayoutGroup[];
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  isEdit: boolean;
  editorOrigin: string | string[];
  diagnostics?: string;
  editorData?: Record<string, CmssyLayoutEditorData>;
  layoutRegions?: readonly LayoutRegion[];
}

export interface CmssyLayoutEditorData {
  data: Record<string, unknown>;
  resolvedContent: Record<string, Record<string, unknown>>;
}

export interface CreateCmssyLoaderOptions {
  blocks?: BlockDefinition[];
  positions?: string[];
  appContext?: Record<string, unknown>;
  retry?: RetryOption;
}

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
    const retry = options.retry ?? "interactive";
    const isEdit = await isVerifiedEditUrl(url, config);

    const editRequested = url.searchParams
      .getAll(CMSSY_EDIT_QUERY_PARAM)
      .includes("1");
    if (!isEdit && editRequested && isDevelopment()) {
      const { collectEditDiagnostics, renderEditDiagnostics } =
        await import("@cmssy/core/preflight");
      const diagnosed = await collectEditDiagnostics({
        config,
        providedSecret: url.searchParams.get(CMSSY_SECRET_QUERY_PARAM),
        devOrigin: url.origin,
      });
      const locales = await resolveSiteLocales(config, { retry });
      return {
        page: null,
        layouts: [],
        locale: locales.defaultLocale,
        defaultLocale: locales.defaultLocale,
        enabledLocales: locales.locales,
        isEdit: false,
        editorOrigin: resolveEditorOrigin(config.editorOrigin),
        diagnostics: renderEditDiagnostics(diagnosed),
      };
    }

    const segments = url.pathname.split("/").filter(Boolean);

    const positions = options.positions ?? layoutRegionIds(config.layout);
    const blocks = options.blocks ?? [];
    const headerLocale = request.headers.get(CMSSY_LOCALE_HEADER) ?? undefined;

    const slot = await resolveCmssyLayoutSlot(config, {
      position: positions[0] ?? "header",
      blocks,
      editMode: isEdit,
      path: segments,
      locale: headerLocale,
      appContext: options.appContext,
      retry,
    });

    const page = await fetchPage(config, slot.path, {
      previewSecret: isEdit ? config.draftSecret : undefined,
      retry,
    });

    let editorData: Record<string, CmssyLayoutEditorData> | undefined;
    if (isEdit && slot.data && slot.resolvedContent) {
      editorData = {
        [positions[0] ?? "header"]: {
          data: slot.data,
          resolvedContent: slot.resolvedContent,
        },
      };
      for (const position of positions.slice(1)) {
        const extra = await resolveCmssyLayoutSlot(config, {
          position,
          blocks,
          editMode: true,
          path: segments,
          locale: headerLocale,
          appContext: options.appContext,
          retry,
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
      editorOrigin: resolveEditorOrigin(config.editorOrigin),
      editorData,
      ...(config.layout ? { layoutRegions: config.layout.regions } : {}),
    };
  };
}

export function createCmssyHeaders(config: CmssyConfig) {
  return function cmssyHeaders(): Record<string, string> {
    return cmssyCspHeaders({ editorOrigin: config.editorOrigin });
  };
}
