"use client";

import { useMemo } from "react";
import type {
  CmssyLayoutGroup,
  RawLayoutBlock,
} from "@cmssy/core";
import { buildBlockMap, type BlockDefinition } from "../registry";
import type { EditBridgeConfig } from "../bridge/use-edit-bridge";
import { useLayoutPatchBridge } from "../bridge/use-layout-patch-bridge";
import { buildBlockContext } from "@cmssy/core";
import { CmssyBlock } from "./cmssy-block";

export interface CmssyEditableLayoutProps {
  groups: CmssyLayoutGroup[];
  blocks: BlockDefinition[];
  position: string;
  locale?: string;
  defaultLocale?: string;
  enabledLocales?: string[];
  edit: EditBridgeConfig;
}

export function CmssyEditableLayout({
  groups,
  blocks,
  position,
  locale = "en",
  defaultLocale = "en",
  enabledLocales,
  edit,
}: CmssyEditableLayoutProps) {
  const blockMap = useMemo(() => buildBlockMap(blocks), [blocks]);
  const layoutBlocks = useMemo<RawLayoutBlock[]>(() => {
    const group = groups.find((g) => g.position === position);
    return group
      ? group.blocks
          .filter((b) => b.isActive)
          .slice()
          .sort((a, b) => a.order - b.order)
      : [];
  }, [groups, position]);
  const patches = useLayoutPatchBridge(position, edit);
  const context = useMemo(
    () => buildBlockContext(locale, defaultLocale, enabledLocales, true),
    [locale, defaultLocale, enabledLocales],
  );

  if (layoutBlocks.length === 0) return null;
  return (
    <>
      {layoutBlocks.map((block) => (
        <CmssyBlock
          key={block.id}
          block={block}
          locale={locale}
          defaultLocale={defaultLocale}
          blockMap={blockMap}
          patchedContent={patches[block.id]}
          layoutPosition={position}
          context={context}
        />
      ))}
    </>
  );
}
