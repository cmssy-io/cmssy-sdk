import type {
  CmssyBlockPage,
  CmssyConfig,
  CmssyFormDefinition,
  CmssyLayoutGroup,
  CmssyPageData,
  FetchLike,
  RetryOption,
} from "@cmssy/core";
import { fetchPage, layoutRegionIds } from "@cmssy/core/internal";
import type { BlockDefinition } from "../registry";
import {
  resolveEditorBlockData,
  resolveEditorLayoutBlockData,
  type EditorBlockData,
} from "./resolve-block-data";
import { resolveCmssyLayoutSlot } from "./resolve-layout-slot";

export interface LoadCmssyRouteOptions {
  blocks: BlockDefinition[];
  path?: string[];
  locale?: string;
  regions?: string[];
  forms?: Record<string, CmssyFormDefinition>;
  appContext?: Record<string, unknown>;
  previewSecret?: string;
  isPreview?: boolean;
  retry?: RetryOption;
  fetch?: FetchLike;
}

export interface CmssyRouteData {
  page: CmssyPageData | null;
  layouts: CmssyLayoutGroup[];
  pageContext: CmssyBlockPage;
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  path: string[];
  blockData: Record<string, unknown>;
  blockContent: Record<string, Record<string, unknown>>;
  layoutData: Record<string, EditorBlockData>;
  regions: string[];
}

export async function loadCmssyRoute(
  config: CmssyConfig,
  options: LoadCmssyRouteOptions,
): Promise<CmssyRouteData> {
  const {
    blocks,
    path,
    locale,
    forms,
    appContext,
    previewSecret,
    isPreview = false,
    retry,
    fetch: fetchImpl,
  } = options;
  const regions = options.regions ?? layoutRegionIds(config.layout);
  const firstRegion = regions[0] ?? "header";

  const slot = await resolveCmssyLayoutSlot(config, {
    region: firstRegion,
    blocks,
    editMode: false,
    preview: isPreview,
    forms,
    appContext,
    retry,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    ...(path ? { path, locale } : { locale: locale ?? "" }),
  } as Parameters<typeof resolveCmssyLayoutSlot>[1]);

  const page = await fetchPage(config, slot.path, {
    ...(previewSecret ? { previewSecret } : {}),
    ...(retry ? { retry } : {}),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });

  const shared = {
    blocks,
    locale: slot.locale,
    defaultLocale: slot.defaultLocale,
    enabledLocales: slot.enabledLocales,
    forms,
    isPreview,
    config,
    appContext,
  };

  const [pageBlocks, ...layoutBlocks] = await Promise.all([
    resolveEditorBlockData({ ...shared, page }),
    ...regions.map((region) =>
      resolveEditorLayoutBlockData({
        ...shared,
        groups: slot.groups,
        page: slot.page,
        region,
      }),
    ),
  ]);

  return {
    page,
    layouts: slot.groups,
    pageContext: slot.page,
    locale: slot.locale,
    defaultLocale: slot.defaultLocale,
    enabledLocales: slot.enabledLocales,
    path: slot.path,
    blockData: pageBlocks.data,
    blockContent: pageBlocks.content,
    layoutData: Object.fromEntries(
      regions.map((region, index) => [region, layoutBlocks[index]!]),
    ),
    regions,
  };
}
