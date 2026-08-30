import type {
  BuildBlockContextExtra,
  CmssyClientConfig,
  CmssyFormDefinition,
  CmssyLayoutGroup,
  CmssyPageData,
  RawLayoutBlock,
} from "@cmssy/core";
import { buildBlockContext } from "@cmssy/core/internal";
import {
  blocksToSchemas,
  buildLoaderMap,
  type BlockDefinition,
} from "../registry";
import { markBlockError } from "./block-error";
import { resolveBlocks, type ResolvedBlock } from "./resolve-blocks";

export type LayoutBlockPage = NonNullable<BuildBlockContextExtra["page"]>;

export interface EditorBlockData {
  data: Record<string, unknown>;
  content: Record<string, Record<string, unknown>>;
}

function collectBlockData(
  blocks: { id: string }[],
  resolved: ResolvedBlock[],
  isPreview: boolean,
): EditorBlockData {
  const data: Record<string, unknown> = {};
  const content: Record<string, Record<string, unknown>> = {};
  blocks.forEach((block, index) => {
    const entry = resolved[index];
    if (!entry) return;
    content[block.id] = entry.content;
    if (entry.error && isPreview) {
      data[block.id] = markBlockError(entry.error);
    } else if (entry.data !== undefined) {
      data[block.id] = entry.data;
    }
  });
  return { data, content };
}

export interface ResolveBlockDataOptions {
  page: CmssyPageData | null;
  blocks: BlockDefinition[];
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  forms?: Record<string, CmssyFormDefinition>;
  isPreview?: boolean;
  config?: CmssyClientConfig;
  appContext?: Record<string, unknown>;
}

export async function resolveEditorBlockData({
  page,
  blocks,
  locale,
  defaultLocale,
  enabledLocales,
  forms,
  isPreview = false,
  config,
  appContext,
}: ResolveBlockDataOptions): Promise<EditorBlockData> {
  if (!page) return { data: {}, content: {} };
  const loaderMap = buildLoaderMap(blocks);
  const context = buildBlockContext(
    locale,
    defaultLocale,
    enabledLocales,
    isPreview,
    forms,
    { page, app: appContext },
  );
  const resolved = await resolveBlocks(
    page.blocks,
    loaderMap,
    locale,
    defaultLocale,
    context,
    enabledLocales,
    { schemas: blocksToSchemas(blocks), config },
  );
  return collectBlockData(page.blocks, resolved, isPreview);
}

export async function resolveBlockData(
  options: ResolveBlockDataOptions,
): Promise<Record<string, unknown>> {
  return (await resolveEditorBlockData(options)).data;
}

export interface ResolveLayoutBlockDataOptions {
  groups: CmssyLayoutGroup[];
  blocks: BlockDefinition[];
  region: string;
  page?: LayoutBlockPage;
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  forms?: Record<string, CmssyFormDefinition>;
  isPreview?: boolean;
  config?: CmssyClientConfig;
  appContext?: Record<string, unknown>;
}

export async function resolveEditorLayoutBlockData({
  groups,
  blocks,
  region,
  page,
  locale,
  defaultLocale,
  enabledLocales,
  forms,
  isPreview = false,
  config,
  appContext,
}: ResolveLayoutBlockDataOptions): Promise<EditorBlockData> {
  const group = groups.find((g) => g.region === region);
  const layoutBlocks: RawLayoutBlock[] = group
    ? group.blocks
        .filter((b) => b.isActive !== false)
        .slice()
        .sort((a, b) => a.order - b.order)
    : [];
  if (layoutBlocks.length === 0) return { data: {}, content: {} };
  const loaderMap = buildLoaderMap(blocks);
  const context = buildBlockContext(
    locale,
    defaultLocale,
    enabledLocales,
    isPreview,
    forms,
    { page, app: appContext },
  );
  const resolved = await resolveBlocks(
    layoutBlocks,
    loaderMap,
    locale,
    defaultLocale,
    context,
    enabledLocales,
    { schemas: blocksToSchemas(blocks), config },
  );
  return collectBlockData(layoutBlocks, resolved, isPreview);
}

export async function resolveLayoutBlockData(
  options: ResolveLayoutBlockDataOptions,
): Promise<Record<string, unknown>> {
  return (await resolveEditorLayoutBlockData(options)).data;
}
