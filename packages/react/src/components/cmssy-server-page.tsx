import type { CmssyPageData } from "../content/content-client";
import { buildBlockMap, type BlockDefinition } from "../registry";
import { renderResolvedBlock } from "./render-resolved-block";

export interface CmssyServerPageProps {
  page: CmssyPageData | null;
  blocks: BlockDefinition[];
  locale?: string;
  defaultLocale?: string;
}

export function CmssyServerPage({
  page,
  blocks,
  locale = "en",
  defaultLocale = "en",
}: CmssyServerPageProps) {
  if (!page) return null;
  const map = buildBlockMap(blocks);
  return (
    <>
      {page.blocks.map((block) =>
        renderResolvedBlock(block, map, locale, defaultLocale),
      )}
    </>
  );
}
