import type {
  CmssyClientConfig,
  CmssyLayoutGroup,
  RawLayoutBlock,
} from "@cmssy/core";
import {
  blocksToSchemas,
  buildBlockMap,
  buildLoaderMap,
  type BlockDefinition,
} from "../registry";
import { buildBlockContext } from "@cmssy/core/internal";
import { renderResolvedBlock } from "./render-resolved-block";
import { resolveBlocks } from "./resolve-blocks";
import { resolveRenderLocale } from "./resolve-render-locale";
import type { LayoutBlockPage } from "./resolve-block-data";

export interface CmssyServerLayoutProps {
  groups: CmssyLayoutGroup[];
  blocks: BlockDefinition[];
  position: string;
  page?: LayoutBlockPage;
  locale?: string;
  defaultLocale?: string;
  enabledLocales?: string[];
  config?: CmssyClientConfig;
  appContext?: Record<string, unknown>;
  editMode?: boolean;
}

export async function CmssyServerLayout({
  groups,
  blocks,
  position,
  page,
  locale: localeProp,
  defaultLocale: defaultLocaleProp,
  enabledLocales: enabledLocalesProp,
  config,
  appContext,
  editMode,
}: CmssyServerLayoutProps) {
  const { locale, defaultLocale, enabledLocales } = await resolveRenderLocale({
    locale: localeProp,
    defaultLocale: defaultLocaleProp,
    enabledLocales: enabledLocalesProp,
    config,
  });
  const group = groups.find((g) => g.position === position);
  const layoutBlocks: RawLayoutBlock[] = group
    ? group.blocks
        .filter((b) => b.isActive !== false)
        .slice()
        .sort((a, b) => a.order - b.order)
    : [];
  if (layoutBlocks.length === 0) return null;
  const map = buildBlockMap(blocks);
  const loaderMap = buildLoaderMap(blocks);
  const context = buildBlockContext(
    locale,
    defaultLocale,
    enabledLocales,
    false,
    undefined,
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
  return (
    <>
      {layoutBlocks.map((block, i) =>
        renderResolvedBlock(block, map, locale, defaultLocale, {
          context,
          data: resolved[i]?.data,
          resolvedContent: resolved[i]?.content,
          enabledLocales,
          error: resolved[i]?.error,
          editMode,
        }),
      )}
    </>
  );
}
