import type {
  CmssyBlockPage,
  CmssyConfig,
  CmssyFormDefinition,
  CmssyLayout,
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

export type CmssyRouteConfig<L extends CmssyLayout = CmssyLayout> = Omit<
  CmssyConfig<L>,
  "draftSecret"
> & {
  draftSecret?: string;
};

export function defineCmssyRouteConfig<L extends CmssyLayout = CmssyLayout>(
  config: CmssyRouteConfig<L>,
): CmssyRouteConfig<L> {
  const org = config.org?.trim() ?? "";
  const workspaceSlug = config.workspaceSlug?.trim() ?? "";
  const missing = [
    ...(org ? [] : ["org"]),
    ...(workspaceSlug ? [] : ["workspaceSlug"]),
  ];
  if (missing.length > 0) {
    throw new Error(
      `cmssy: defineCmssyRouteConfig is missing ${missing.join(" and ")}. ` +
        "Both name a public workspace, so a browser build can carry them - " +
        "read them from import.meta.env if they differ per environment.",
    );
  }
  if (typeof window !== "undefined") {
    const carried = [
      ...(config.draftSecret === undefined ? [] : ["draftSecret"]),
      ...(config.devToken === undefined ? [] : ["devToken"]),
    ];
    if (carried.length > 0) {
      throw new Error(
        `cmssy: ${carried.join(" and ")} reached the browser. Anyone loading ` +
          "the page can read a value in the bundle: a draft secret opens every " +
          "unpublished draft in the workspace, and a devToken is an API " +
          "credential that writes to it. Keep both on a server build " +
          "(@cmssy/next, @cmssy/astro or Vite SSR) and leave them out of a " +
          "client-side config.",
      );
    }
  }
  return { ...config, org, workspaceSlug };
}

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
  config: CmssyRouteConfig,
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

  const slot = await resolveCmssyLayoutSlot(config as CmssyConfig, {
    region: firstRegion,
    blocks,
    editMode: false,
    preview: isPreview,
    forms,
    appContext,
    retry,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    path: path ?? [],
    ...(locale === undefined ? {} : { locale }),
  });

  const secret = previewSecret ?? (isPreview ? config.draftSecret : undefined);
  const page = await fetchPage(config as CmssyConfig, slot.path, {
    ...(secret ? { previewSecret: secret } : {}),
    ...(retry === undefined ? {} : { retry }),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });

  const shared = {
    blocks,
    locale: slot.locale,
    defaultLocale: slot.defaultLocale,
    enabledLocales: slot.enabledLocales,
    forms,
    isPreview,
    config: config as CmssyConfig,
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
