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
  /**
   * The editor's block data, both halves, straight from the loader. Without
   * `resolvedContent` the canvas shows a relation field as the raw ids it
   * stores - the site looks right and the editor cannot fill the header.
   */
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
}

/**
 * The header and footer, which are layout blocks rather than markup you own.
 *
 * A React island: Astro renders it on the server for visitors (no client JS),
 * and with `client:load` on the edit route, where the bridge needs the browser.
 *
 * Two renders, one per mode, and the difference is the point: server-rendered
 * for visitors, and through the edit bridge for the editor. A header still
 * server-rendered in edit mode is one the editor can select and cannot fill.
 */
export default function LayoutSlot({
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
