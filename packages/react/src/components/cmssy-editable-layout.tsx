"use client";

import { useMemo } from "react";
import type { CmssyLayoutGroup, RawLayoutBlock } from "@cmssy/core";
import {
  blocksToSchemas,
  buildBlockMap,
  type BlockDefinition,
} from "../registry";
import type { EditBridgeConfig } from "../bridge/use-edit-bridge";
import { useLayoutPatchBridge } from "../bridge/use-layout-patch-bridge";
import { buildBlockContext } from "@cmssy/core/internal";
import { CmssyBlock } from "./cmssy-block";
import type { LayoutBlockPage } from "./resolve-block-data";

export interface CmssyEditableLayoutProps {
  groups: CmssyLayoutGroup[];
  blocks: BlockDefinition[];
  region: string;
  page?: LayoutBlockPage;
  locale?: string;
  defaultLocale?: string;
  enabledLocales?: string[];
  edit: EditBridgeConfig;
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
  appContext?: Record<string, unknown>;
}

export function CmssyEditableLayout({
  groups,
  blocks,
  region,
  page,
  locale = "en",
  defaultLocale = "en",
  enabledLocales,
  edit,
  data,
  resolvedContent,
  appContext,
}: CmssyEditableLayoutProps) {
  const blockMap = useMemo(() => buildBlockMap(blocks), [blocks]);
  const schemas = useMemo(
    () => edit.schemas ?? blocksToSchemas(blocks),
    [edit.schemas, blocks],
  );
  const layoutBlocks = useMemo<RawLayoutBlock[]>(() => {
    const group = groups.find((g) => g.region === region);
    return group
      ? group.blocks
          .filter((b) => b.isActive !== false)
          .slice()
          .sort((a, b) => a.order - b.order)
      : [];
  }, [groups, region]);
  const patches = useLayoutPatchBridge(region, edit);
  const context = useMemo(
    () =>
      buildBlockContext(locale, defaultLocale, enabledLocales, true, undefined, {
        page,
        app: appContext,
      }),
    [locale, defaultLocale, enabledLocales, page, appContext],
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
          resolvedContent={resolvedContent?.[block.id]}
          schema={schemas[block.type]}
          editMode
          layoutRegion={region}
          context={context}
          data={data?.[block.id]}
        />
      ))}
    </>
  );
}
