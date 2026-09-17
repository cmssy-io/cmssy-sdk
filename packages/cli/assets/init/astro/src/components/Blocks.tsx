import { CmssyBlocks } from "@cmssy/react";
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
  return (
    <CmssyBlocks
      page={page}
      blocks={blocks}
      locale={locale}
      defaultLocale={defaultLocale}
      enabledLocales={enabledLocales}
      blockData={blockData}
      blockContent={blockContent}
    />
  );
}
