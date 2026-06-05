import type {
  CmssyLayoutGroup,
  RawLayoutBlock,
} from "../content/content-client";
import { buildBlockMap, type BlockDefinition } from "../registry";
import { renderResolvedBlock } from "./render-resolved-block";

export interface CmssyServerLayoutProps {
  groups: CmssyLayoutGroup[];
  blocks: BlockDefinition[];
  position: string;
  locale?: string;
  defaultLocale?: string;
}

export function CmssyServerLayout({
  groups,
  blocks,
  position,
  locale = "en",
  defaultLocale = "en",
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
  return (
    <>
      {layoutBlocks.map((block) =>
        renderResolvedBlock(block, map, locale, defaultLocale),
      )}
    </>
  );
}
