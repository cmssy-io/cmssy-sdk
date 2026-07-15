import type { CmssyFormDefinition, CmssyPageData } from "@cmssy/core";
import { buildBlockContext } from "@cmssy/core";
import { buildLoaderMap, type BlockDefinition } from "../registry";
import { resolveBlocks } from "./resolve-blocks";

export interface ResolveBlockDataOptions {
  page: CmssyPageData | null;
  blocks: BlockDefinition[];
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  forms?: Record<string, CmssyFormDefinition>;
  isPreview?: boolean;
}

export async function resolveBlockData({
  page,
  blocks,
  locale,
  defaultLocale,
  enabledLocales,
  forms,
  isPreview = false,
}: ResolveBlockDataOptions): Promise<Record<string, unknown>> {
  if (!page) return {};
  const loaderMap = buildLoaderMap(blocks);
  const context = buildBlockContext(
    locale,
    defaultLocale,
    enabledLocales,
    isPreview,
    forms,
  );
  const resolved = await resolveBlocks(
    page.blocks,
    loaderMap,
    locale,
    defaultLocale,
    context,
    enabledLocales,
  );
  const data: Record<string, unknown> = {};
  page.blocks.forEach((block, index) => {
    const value = resolved[index]?.data;
    if (value !== undefined) data[block.id] = value;
  });
  return data;
}
