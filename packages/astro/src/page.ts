import {
  CMSSY_EDIT_HEADER,
  isVerifiedEditUrl,
  type CmssyBlockPage,
  type CmssyConfig,
  type CmssyLayoutGroup,
  type CmssyPageData,
  type LayoutRegion,
  type RetryOption,
} from "@cmssy/core";
import {
  CMSSY_LOCALE_HEADER,
  fetchPage,
  layoutRegionIds,
} from "@cmssy/core/internal";
import { resolveCmssyLayoutSlot, type BlockDefinition } from "@cmssy/react";

import { CMSSY_EDIT_PATH_PREFIX } from "./middleware";

function withoutEditPrefix(pathname: string): string {
  if (pathname === CMSSY_EDIT_PATH_PREFIX) return "/";
  return pathname.startsWith(`${CMSSY_EDIT_PATH_PREFIX}/`)
    ? pathname.slice(CMSSY_EDIT_PATH_PREFIX.length)
    : pathname;
}

export interface CmssyPageResult {
  page: CmssyPageData | null;
  layouts: CmssyLayoutGroup[];
  pageContext: CmssyBlockPage;
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  isEdit: boolean;
  editorData?: Record<string, CmssyLayoutEditorData>;
  editorOrigin?: string | string[];
  layoutRegions?: readonly LayoutRegion[];
}

export interface CmssyLayoutEditorData {
  data: Record<string, unknown>;
  resolvedContent: Record<string, Record<string, unknown>>;
}

export interface LoadCmssyPageOptions {
  blocks?: BlockDefinition[];
  positions?: string[];
  appContext?: Record<string, unknown>;
  retry?: RetryOption;
  prerendered?: boolean;
}

export async function loadCmssyPage(
  config: CmssyConfig,
  request: Request,
  url: URL,
  options: LoadCmssyPageOptions = {},
): Promise<CmssyPageResult> {
  const isEdit =
    request.headers.get(CMSSY_EDIT_HEADER) === "1" ||
    (await isVerifiedEditUrl(url, config));

  const segments = withoutEditPrefix(url.pathname).split("/").filter(Boolean);

  const positions = options.positions ?? layoutRegionIds(config.layout);
  const blocks = options.blocks ?? [];
  const headerLocale = request.headers.get(CMSSY_LOCALE_HEADER) ?? undefined;
  const retry =
    options.retry ?? (options.prerendered === false ? "interactive" : "build");

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
    pageContext: slot.page,
    locale: slot.locale,
    defaultLocale: slot.defaultLocale,
    enabledLocales: slot.enabledLocales,
    isEdit,
    editorData,
    editorOrigin: slot.editorOrigin,
    ...(config.layout ? { layoutRegions: config.layout.regions } : {}),
  };
}
