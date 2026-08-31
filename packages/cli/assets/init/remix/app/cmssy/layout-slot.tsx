import {
  CmssyBlock,
  buildBlockContext,
  buildBlockMap,
  type CmssyBlockPage,
  type CmssyLayoutGroup,
} from "@cmssy/react";
import { CmssyLazyLayout } from "@cmssy/react/client";
import type { CmssyRegion } from "@cmssy/remix";
import type { layout } from "../../cmssy.config";
import { blocks } from "./blocks";

export interface LayoutSlotProps {
  groups: CmssyLayoutGroup[];
  region: CmssyRegion<typeof layout>;
  page: CmssyBlockPage;
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  edit?: { editorOrigin: string | string[] };
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
}

export function LayoutSlot({
  groups,
  region,
  page,
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
        region={region}
        page={page}
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

  const group = groups.find((candidate) => candidate.region === region);
  if (!group) return null;

  const blockMap = buildBlockMap(blocks);
  const context = buildBlockContext(
    locale,
    defaultLocale,
    enabledLocales,
    false,
    undefined,
    { page },
  );

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
            resolvedContent={resolvedContent?.[block.id]}
            data={data?.[block.id]}
          />
        ))}
    </>
  );
}
