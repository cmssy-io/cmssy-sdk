import type { CmssyPageData } from "../content/content-client";
import type { CmssyFormDefinition } from "../data/queries";
import { getBlockContentForLanguage } from "../content/get-block-content";
import { buildBlockMap, buildLoaderMap, type BlockDefinition } from "../registry";
import { buildBlockContext } from "./block-context";
import { renderResolvedBlock } from "./render-resolved-block";

export interface CmssyServerPageProps {
  page: CmssyPageData | null;
  blocks: BlockDefinition[];
  locale?: string;
  defaultLocale?: string;
  /** All languages enabled on the workspace; exposed to blocks via context.locale.enabled. */
  enabledLocales?: string[];
  /** Form definitions referenced by page blocks, exposed via context.forms. */
  forms?: Record<string, CmssyFormDefinition>;
}

/**
 * Async React Server Component (Next.js App Router / RSC). It runs each block's
 * loader server-side before rendering, so it must be rendered in a server
 * component tree (as `createCmssyPage` does) - not in a client component.
 */
export async function CmssyServerPage({
  page,
  blocks,
  locale = "en",
  defaultLocale = "en",
  enabledLocales,
  forms,
}: CmssyServerPageProps) {
  if (!page) return null;
  const map = buildBlockMap(blocks);
  const loaderMap = buildLoaderMap(blocks);
  const context = buildBlockContext(
    locale,
    defaultLocale,
    enabledLocales,
    false,
    forms,
  );

  // Resolve each block's localized content once, reused for both the loader and
  // the render below.
  const resolved = page.blocks.map((block) =>
    getBlockContentForLanguage(block.content, locale, defaultLocale),
  );

  // Run each block's loader server-side (in parallel); the result is passed to
  // the block as its `data` prop, enabling SSR of fetched data.
  const data = await Promise.all(
    page.blocks.map(async (block, i) => {
      const loader = loaderMap[block.type];
      if (!loader) return undefined;
      try {
        return await loader({ content: resolved[i] ?? {}, context });
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn(`cmssy: loader for block "${block.type}" failed`, err);
        }
        return undefined;
      }
    }),
  );

  return (
    <>
      {page.blocks.map((block, i) =>
        renderResolvedBlock(
          block,
          map,
          locale,
          defaultLocale,
          context,
          data[i],
          resolved[i],
        ),
      )}
    </>
  );
}
