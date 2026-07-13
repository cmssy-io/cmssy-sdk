import type {
  CmssyLayoutGroup,
  RawLayoutBlock,
} from "../content/content-client";
import {
  buildBlockMap,
  buildLoaderMap,
  type BlockDefinition,
} from "../registry";
import { buildBlockContext } from "./block-context";
import { renderResolvedBlock } from "./render-resolved-block";
import { resolveBlocks } from "./resolve-blocks";

export interface CmssyServerLayoutProps {
  groups: CmssyLayoutGroup[];
  blocks: BlockDefinition[];
  position: string;
  locale?: string;
  defaultLocale?: string;
  /** All languages enabled on the workspace; exposed to blocks via context.locale.enabled. */
  enabledLocales?: string[];
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
  locale = "en",
  defaultLocale = "en",
  enabledLocales,
}: CmssyServerLayoutProps) {
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
  );
  return (
    <>
      {layoutBlocks.map((block, i) =>
        renderResolvedBlock(block, map, locale, defaultLocale, {
          context,
          data: resolved[i]?.data,
          resolvedContent: resolved[i]?.content,
          enabledLocales,
        }),
      )}
    </>
  );
}
