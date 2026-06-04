import type {
  CmssyLayoutGroup,
  RawLayoutBlock,
} from "../content/content-client";
import { CmssyBlock } from "./cmssy-block";

export interface CmssyLayoutProps {
  groups: CmssyLayoutGroup[];
  position: string;
  locale?: string;
  defaultLocale?: string;
}

export function CmssyLayout({
  groups,
  position,
  locale = "en",
  defaultLocale = "en",
}: CmssyLayoutProps) {
  const group = groups.find((g) => g.position === position);
  const blocks: RawLayoutBlock[] = group
    ? group.blocks
        .filter((b) => b.isActive)
        .slice()
        .sort((a, b) => a.order - b.order)
    : [];

  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block) => (
        <CmssyBlock
          key={block.id}
          block={block}
          locale={locale}
          defaultLocale={defaultLocale}
        />
      ))}
    </>
  );
}
