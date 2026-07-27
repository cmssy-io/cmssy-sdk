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
  /** Set on a VERIFIED editor request; the loader reports it as `isEdit`. */
  edit?: { editorOrigin: string | string[] };
}

/**
 * The header and footer, which are layout blocks rather than markup you own.
 *
 * Two renders, one per mode, and the difference is the point: server-rendered
 * for visitors, and through the edit bridge for the editor. A header still
 * server-rendered in edit mode is one the editor can select and cannot fill.
 */
export function LayoutSlot({
  groups,
  position,
  locale,
  defaultLocale,
  enabledLocales,
  edit,
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
