import type { CmssyPageData } from "../content/content-client";
import type { CmssyFormDefinition } from "../data/queries";
import { buildBlockMap, type BlockDefinition } from "../registry";
import { buildBlockContext } from "./block-context";
import { renderResolvedBlock } from "./render-resolved-block";

export interface CmssyServerPageProps {
  page: CmssyPageData | null;
  blocks: BlockDefinition[];
  locale?: string;
  defaultLocale?: string;
  /** All languages enabled on the workspace; exposed to blocks via context.locale.enabled. */
  enabledLocales?: string[];
  /** Form definitions referenced by page blocks, exposed via context.forms. */
  forms?: Record<string, CmssyFormDefinition>;
}

export function CmssyServerPage({
  page,
  blocks,
  locale = "en",
  defaultLocale = "en",
  enabledLocales,
  forms,
}: CmssyServerPageProps) {
  if (!page) return null;
  const map = buildBlockMap(blocks);
  const context = buildBlockContext(
    locale,
    defaultLocale,
    enabledLocales,
    false,
    forms,
  );
  return (
    <>
      {page.blocks.map((block) =>
        renderResolvedBlock(block, map, locale, defaultLocale, context),
      )}
    </>
  );
}
