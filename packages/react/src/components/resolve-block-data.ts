import type {
  CmssyFormDefinition,
  CmssyLayoutGroup,
  CmssyPageData,
  RawLayoutBlock,
} from "@cmssy/core";
import { buildBlockContext } from "@cmssy/core";
import { buildLoaderMap, type BlockDefinition } from "../registry";
import { markBlockError } from "./block-error";
import { resolveBlocks, type ResolvedBlock } from "./resolve-blocks";

function collectBlockData(
  blocks: { id: string }[],
  resolved: ResolvedBlock[],
  isPreview: boolean,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  blocks.forEach((block, index) => {
    const entry = resolved[index];
    if (!entry) return;
    if (entry.error && isPreview) {
      data[block.id] = markBlockError(entry.error);
    } else if (entry.data !== undefined) {
      data[block.id] = entry.data;
    }
  });
  return data;
}

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
  return collectBlockData(page.blocks, resolved, isPreview);
}

export interface ResolveLayoutBlockDataOptions {
  groups: CmssyLayoutGroup[];
  blocks: BlockDefinition[];
  position: string;
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  forms?: Record<string, CmssyFormDefinition>;
  isPreview?: boolean;
}

export async function resolveLayoutBlockData({
  groups,
  blocks,
  position,
  locale,
  defaultLocale,
  enabledLocales,
  forms,
  isPreview = false,
}: ResolveLayoutBlockDataOptions): Promise<Record<string, unknown>> {
  const group = groups.find((g) => g.position === position);
  const layoutBlocks: RawLayoutBlock[] = group
    ? group.blocks
        .filter((b) => b.isActive)
        .slice()
        .sort((a, b) => a.order - b.order)
    : [];
  if (layoutBlocks.length === 0) return {};
  const loaderMap = buildLoaderMap(blocks);
  const context = buildBlockContext(
    locale,
    defaultLocale,
    enabledLocales,
    isPreview,
    forms,
  );
  const resolved = await resolveBlocks(
    layoutBlocks,
    loaderMap,
    locale,
    defaultLocale,
    context,
    enabledLocales,
  );
  return collectBlockData(layoutBlocks, resolved, isPreview);
}
