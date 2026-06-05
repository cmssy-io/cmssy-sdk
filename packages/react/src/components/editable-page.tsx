import { useMemo } from "react";
import type { CmssyPageData, RawBlock } from "../content/content-client";
import {
  blocksToMeta,
  blocksToSchemas,
  buildBlockMap,
  type BlockDefinition,
  type BlockMap,
} from "../registry";
import {
  useEditBridge,
  type EditBridgeConfig,
} from "../bridge/use-edit-bridge";
import { useDragAgent } from "../bridge/use-drag-agent";
import { CmssyBlock } from "./cmssy-block";

export interface CmssyEditablePageProps {
  page: CmssyPageData | null;
  locale?: string;
  defaultLocale?: string;
  edit: EditBridgeConfig;
  blocks?: BlockDefinition[];
  category?: string;
}

export function CmssyEditablePage({
  page,
  locale = "en",
  defaultLocale = "en",
  edit,
  blocks,
  category,
}: CmssyEditablePageProps) {
  if (!page) return null;
  return (
    <EditableBlocks
      page={page}
      locale={locale}
      defaultLocale={defaultLocale}
      edit={edit}
      blocks={blocks}
      category={category}
    />
  );
}

interface EditableBlocksProps {
  page: CmssyPageData;
  locale: string;
  defaultLocale: string;
  edit: EditBridgeConfig;
  blocks?: BlockDefinition[];
  category?: string;
}

function EditableBlocks({
  page,
  locale,
  defaultLocale,
  edit,
  blocks,
  category,
}: EditableBlocksProps) {
  const blockMap = useMemo<BlockMap | undefined>(
    () => (blocks ? buildBlockMap(blocks) : undefined),
    [blocks],
  );

  const bridgeConfig = useMemo<EditBridgeConfig>(() => {
    if (!blocks) return edit;
    return {
      ...edit,
      schemas: edit.schemas ?? blocksToSchemas(blocks),
      blockMeta: edit.blockMeta ?? blocksToMeta(blocks, { category }),
    };
  }, [edit, blocks, category]);

  const { patches, inserted, order, removed } = useEditBridge(
    page,
    bridgeConfig,
  );
  const { dropY } = useDragAgent(bridgeConfig);

  const renderBlocks = useMemo<RawBlock[]>(() => {
    const removedSet = new Set(removed);
    const merged = page.blocks.filter((b) => !removedSet.has(b.id));
    const sorted = [...inserted]
      .filter((ins) => !removedSet.has(ins.blockId))
      .sort((a, b) => a.index - b.index);
    for (const ins of sorted) {
      const at = Math.max(0, Math.min(ins.index, merged.length));
      merged.splice(at, 0, {
        id: ins.blockId,
        type: ins.blockType,
        content: ins.content,
      });
    }
    if (order) {
      const rank = new Map(order.map((id, i) => [id, i]));
      const fallback = order.length;
      merged.sort(
        (a, b) => (rank.get(a.id) ?? fallback) - (rank.get(b.id) ?? fallback),
      );
    }
    return merged;
  }, [page.blocks, inserted, order, removed]);

  return (
    <>
      {renderBlocks.map((block) => (
        <CmssyBlock
          key={block.id}
          block={block}
          locale={locale}
          defaultLocale={defaultLocale}
          patchedContent={patches[block.id]}
          blockMap={blockMap}
          editable
        />
      ))}
      {dropY !== null && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: dropY,
            height: 2,
            background: "#3b82f6",
            zIndex: 2147483647,
            pointerEvents: "none",
          }}
        />
      )}
    </>
  );
}
