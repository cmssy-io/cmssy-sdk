import type { CmssyPageData } from "../content/content-client";
import { CmssyBlock } from "./cmssy-block";

export interface CmssyClientPageProps {
  page: CmssyPageData | null;
  locale?: string;
  defaultLocale?: string;
}

// Blocks come from the runtime registry (createElement from a Map), which
// defeats Next's "use client" boundary detection — rendering interactive blocks
// from a server component crashes under the react-server condition. This client
// boundary keeps SSR HTML while giving block hooks a working dispatcher.
export function CmssyClientPage({
  page,
  locale = "en",
  defaultLocale = "en",
}: CmssyClientPageProps) {
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
