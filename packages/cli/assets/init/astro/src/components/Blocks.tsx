import { CmssyBlock, buildBlockMap, buildBlockContext } from "@cmssy/react";
import type { CmssyPageData } from "@cmssy/core";
import { blocks } from "../cmssy/blocks";

export function Blocks({
  page,
  locale,
  defaultLocale,
  enabledLocales,
  blockData,
  blockContent,
}: {
  page: CmssyPageData;
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  blockData: Record<string, unknown>;
  blockContent: Record<string, Record<string, unknown>>;
}) {
  const blockMap = buildBlockMap(blocks);
  const context = buildBlockContext(locale, defaultLocale, enabledLocales);

  return (
    <>
      {(page.blocks ?? []).map((block) => (
        <CmssyBlock
          key={block.id}
          block={block}
          blockMap={blockMap}
          locale={locale}
          defaultLocale={defaultLocale}
          context={context}
          resolvedContent={blockContent[block.id]}
          data={blockData[block.id]}
        />
      ))}
    </>
  );
}
