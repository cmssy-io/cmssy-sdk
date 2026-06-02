import { useMemo } from "react";
import type { CmssyPageData, RawBlock } from "../content/content-client";
import {
  useEditBridge,
  type EditBridgeConfig,
} from "../bridge/use-edit-bridge";
import { CmssyBlock } from "./cmssy-block";

export interface CmssyEditablePageProps {
  page: CmssyPageData | null;
  locale?: string;
  defaultLocale?: string;
  edit: EditBridgeConfig;
}

export function CmssyEditablePage({
  page,
  locale = "en",
  defaultLocale = "en",
  edit,
}: CmssyEditablePageProps) {
  if (!page) return null;
  return (
    <EditableBlocks
      page={page}
      locale={locale}
      defaultLocale={defaultLocale}
      edit={edit}
    />
  );
}

interface EditableBlocksProps {
  page: CmssyPageData;
  locale: string;
  defaultLocale: string;
  edit: EditBridgeConfig;
}

function EditableBlocks({
  page,
  locale,
  defaultLocale,
  edit,
}: EditableBlocksProps) {
  const { patches, inserted, order, removed } = useEditBridge(page, edit);

  const blocks = useMemo<RawBlock[]>(() => {
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
      const fallback = merged.length;
      merged.sort(
        (a, b) => (rank.get(a.id) ?? fallback) - (rank.get(b.id) ?? fallback),
      );
    }
    return merged;
  }, [page.blocks, inserted, order, removed]);

  return (
    <>
      {blocks.map((block) => (
        <CmssyBlock
          key={block.id}
          block={block}
          locale={locale}
          defaultLocale={defaultLocale}
          patchedContent={patches[block.id]}
        />
      ))}
    </>
  );
}
