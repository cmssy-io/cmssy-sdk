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
import { buildBlockContext } from "@cmssy/core";
import { renderResolvedBlock } from "./render-resolved-block";
import { resolveBlocks } from "./resolve-blocks";
import { resolveRenderLocale } from "./resolve-render-locale";

export interface CmssyServerLayoutProps {
  groups: CmssyLayoutGroup[];
  blocks: BlockDefinition[];
  position: string;
  /** The language to render in. Omit it and the workspace's default is used. */
  locale?: string;
  defaultLocale?: string;
  /** All languages enabled on the workspace; exposed to blocks via context.locale.enabled. */
  enabledLocales?: string[];
  /**
   * The workspace, so the languages can be looked up when they are not passed.
   * Without it the SDK has to guess, and its guess is "en".
   */
  config?: CmssyClientConfig;
  editMode?: boolean;
}

/**
 * Async React Server Component. Like CmssyServerPage it runs each block's
 * loader server-side before rendering, so a header block can list categories
 * the same way a page block can. Must be rendered in a server component tree.
 */
export async function CmssyServerLayout({
  groups,
  blocks,
  position,
  locale: localeProp,
  defaultLocale: defaultLocaleProp,
  enabledLocales: enabledLocalesProp,
  config,
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
        .filter((b) => b.isActive)
        .slice()
        .sort((a, b) => a.order - b.order)
    : [];
  if (layoutBlocks.length === 0) return null;
  const map = buildBlockMap(blocks);
  const loaderMap = buildLoaderMap(blocks);
  const context = buildBlockContext(locale, defaultLocale, enabledLocales);
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
