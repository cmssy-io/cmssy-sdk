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
  // the render below. Each block's loader runs server-side (in parallel); its
  // result is passed to the block as the `data` prop, enabling SSR of fetched
  // data.
  const resolved = await Promise.all(
    page.blocks.map(async (block) => {
      const content = getBlockContentForLanguage(
        block.content,
        locale,
        defaultLocale,
      );
      const loader = loaderMap[block.type];
      let data: unknown;
      if (loader) {
        try {
          data = await loader({ content, context });
        } catch (err) {
          if (typeof console !== "undefined") {
            console.warn(
              `[cmssy] loader for block "${block.type}" failed`,
              err,
            );
          }
        }
      }
      return { content, data };
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
          resolved[i]?.data,
          resolved[i]?.content,
        ),
      )}
    </>
  );
}
