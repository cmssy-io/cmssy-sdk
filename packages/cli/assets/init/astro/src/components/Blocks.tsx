import { CmssyBlock, buildBlockMap, buildBlockContext } from "@cmssy/react";
import type { CmssyPageData } from "@cmssy/core";
import { blocks } from "../cmssy/blocks";

export function Blocks({
  page,
  locale,
  defaultLocale,
  enabledLocales,
}: {
  page: CmssyPageData;
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
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
        />
      ))}
    </>
  );
}
