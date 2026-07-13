import type { RawBlock } from "../content/content-client";
import { getBlockContentForLanguage } from "../content/get-block-content";
import type { LoaderMap } from "../registry";
import type { CmssyBlockContext } from "./block-context";

export interface ResolvedBlock {
  content: Record<string, unknown>;
  data: unknown;
}

export async function resolveBlocks(
  blocks: RawBlock[],
  loaderMap: LoaderMap,
  locale: string,
  defaultLocale: string,
  context: CmssyBlockContext,
  enabledLocales?: string[],
): Promise<ResolvedBlock[]> {
  return Promise.all(
    blocks.map(async (block) => {
      const content = getBlockContentForLanguage(
        block.content,
        locale,
        defaultLocale,
        enabledLocales?.length ? enabledLocales : undefined,
      );
      const loader = loaderMap[block.type];
      let data: unknown;
      if (loader) {
        try {
          data = await loader({ content, context });
        } catch (err) {
          if (typeof console !== "undefined") {
            console.warn(
              `[cmssy] loader for block "${block.type}" (${block.id}) failed`,
              err,
            );
          }
        }
      }
      return { content, data };
    }),
  );
}
