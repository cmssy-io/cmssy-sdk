import { useMemo } from "react";
import type { CmssyPageData, RawBlock } from "@cmssy/core";
import type { CmssyFormDefinition } from "@cmssy/core";
import {
  blocksToMeta,
  blocksToSchemas,
  buildBlockMap,
  type BlockDefinition,
} from "../registry";
import {
  useEditBridge,
  type EditBridgeConfig,
} from "../bridge/use-edit-bridge";
import { useDragAgent } from "../bridge/use-drag-agent";
import { buildBlockContext } from "@cmssy/core";
import { CmssyBlock } from "./cmssy-block";

export interface CmssyEditablePageProps {
  page: CmssyPageData | null;
  blocks: BlockDefinition[];
  locale?: string;
  defaultLocale?: string;
  enabledLocales?: string[];
  edit: EditBridgeConfig;
  category?: string;
  forms?: Record<string, CmssyFormDefinition>;
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
}

export function CmssyEditablePage({
  page,
  blocks,
  locale = "en",
  defaultLocale = "en",
  enabledLocales,
  edit,
  category,
  forms,
  data,
  resolvedContent,
}: CmssyEditablePageProps) {
  if (!Array.isArray(blocks)) {
    throw new Error(
      "cmssy: CmssyEditablePage requires a blocks array — pass your defineBlock(...) array",
    );
  }
  if (!page) return null;
  return (
    <EditableBlocks
      page={page}
      blocks={blocks}
      locale={locale}
      defaultLocale={defaultLocale}
      enabledLocales={enabledLocales}
      edit={edit}
      category={category}
      forms={forms}
      data={data}
      resolvedContent={resolvedContent}
    />
  );
}

interface EditableBlocksProps {
  page: CmssyPageData;
  blocks: BlockDefinition[];
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  edit: EditBridgeConfig;
  category?: string;
  forms?: Record<string, CmssyFormDefinition>;
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
}

function EditableBlocks({
  page,
  blocks,
  locale,
  defaultLocale,
  enabledLocales,
  edit,
  category,
  forms,
  data,
  resolvedContent,
}: EditableBlocksProps) {
  const blockMap = useMemo(() => buildBlockMap(blocks), [blocks]);
  const context = useMemo(
    () => buildBlockContext(locale, defaultLocale, enabledLocales, true, forms),
    [locale, defaultLocale, enabledLocales, forms],
  );

  const bridgeConfig = useMemo<EditBridgeConfig>(
    () => ({
      ...edit,
      schemas: edit.schemas ?? blocksToSchemas(blocks),
      blockMeta: edit.blockMeta ?? blocksToMeta(blocks, { category }),
    }),
    [edit, blocks, category],
  );

  const { patches, patchesStyle, patchesAdvanced, inserted, order, removed } =
    useEditBridge(page, bridgeConfig);
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
        style: ins.style,
        advanced: ins.advanced,
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
          patchedStyle={patchesStyle[block.id]}
          patchedAdvanced={patchesAdvanced[block.id]}
          resolvedContent={resolvedContent?.[block.id]}
          schema={bridgeConfig.schemas?.[block.type]}
          blockMap={blockMap}
          editable
          context={context}
          data={data?.[block.id]}
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
