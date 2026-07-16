import type { RawBlock } from "@cmssy/core";
import { getBlockContentForLanguage } from "@cmssy/core";
import type { LoaderMap } from "../registry";
import type { CmssyBlockContext } from "@cmssy/core";
import { blockErrorMessage, type CmssyBlockError } from "./block-error";

export interface ResolvedBlock {
  content: Record<string, unknown>;
  data: unknown;
  error?: CmssyBlockError;
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
      let error: CmssyBlockError | undefined;
      if (loader) {
        try {
          data = await loader({ content, context });
        } catch (err) {
          if (typeof console !== "undefined") {
            console.error(
              `[cmssy] loader for block "${block.type}" (${block.id}) failed`,
              err,
            );
          }
          error = { message: blockErrorMessage(err), source: "loader" };
        }
      }
      return { content, data, error };
    }),
  );
}
