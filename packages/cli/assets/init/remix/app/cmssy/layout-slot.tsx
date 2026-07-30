import {
  CmssyBlock,
  buildBlockContext,
  buildBlockMap,
  type CmssyLayoutGroup,
} from "@cmssy/react";
import { CmssyLazyLayout } from "@cmssy/react/client";
import { blocks } from "./blocks";

export interface LayoutSlotProps {
  groups: CmssyLayoutGroup[];
  position: "header" | "footer";
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  edit?: { editorOrigin: string | string[] };
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
}

export function LayoutSlot({
  groups,
  position,
  locale,
  defaultLocale,
  enabledLocales,
  edit,
  data,
  resolvedContent,
}: LayoutSlotProps) {
  if (edit) {
    return (
      <CmssyLazyLayout
        groups={groups}
        position={position}
        locale={locale}
        defaultLocale={defaultLocale}
        enabledLocales={enabledLocales}
        edit={edit}
        data={data}
        resolvedContent={resolvedContent}
        load={() => import("./blocks")}
      />
    );
  }

  const group = groups.find((candidate) => candidate.position === position);
  if (!group) return null;

  const blockMap = buildBlockMap(blocks);
  const context = buildBlockContext(locale, defaultLocale, enabledLocales);

  return (
    <>
      {[...group.blocks]
        .filter((block) => block.isActive !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((block) => (
          <CmssyBlock
            key={block.id}
            block={block}
            blockMap={blockMap}
            locale={locale}
            defaultLocale={defaultLocale}
            context={context}
          />
        ))}
    </>
  );
}
