import type { CmssyPageData } from "../content/content-client";
import { CmssyBlock } from "./cmssy-block";

export interface CmssyPageProps {
  page: CmssyPageData | null;
  locale?: string;
  defaultLocale?: string;
}

export function CmssyPage({
  page,
  locale = "en",
  defaultLocale = "en",
}: CmssyPageProps) {
  if (!page) return null;
  return (
    <>
      {page.blocks.map((block) => (
        <CmssyBlock
          key={block.id}
          block={block}
          locale={locale}
          defaultLocale={defaultLocale}
        />
      ))}
    </>
  );
}
