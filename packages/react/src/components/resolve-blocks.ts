import type { CmssyClientConfig, RawBlock } from "@cmssy/core";
import {
  getBlockContentForLanguage,
  resolveRelationContent,
  type BlockSchemaMap,
} from "@cmssy/core";
import type { LoaderMap } from "../registry";
import type { CmssyBlockContext } from "@cmssy/core";
import { blockErrorMessage, type CmssyBlockError } from "./block-error";

export interface ResolvedBlock {
  content: Record<string, unknown>;
  data: unknown;
  error?: CmssyBlockError;
}

export interface ResolveBlocksOptions {
  /** Block schemas keyed by block type; needed to spot relation fields. */
  schemas?: BlockSchemaMap;
  /** Workspace the relation records are read from. No config, no resolution. */
  config?: CmssyClientConfig;
}

export async function resolveBlocks(
  blocks: RawBlock[],
  loaderMap: LoaderMap,
  locale: string,
  defaultLocale: string,
  context: CmssyBlockContext,
  enabledLocales?: string[],
  options?: ResolveBlocksOptions,
): Promise<ResolvedBlock[]> {
  const contents = blocks.map((block) =>
    getBlockContentForLanguage(
      block.content,
      locale,
      defaultLocale,
      enabledLocales?.length ? enabledLocales : undefined,
    ),
  );

  if (options?.config && options.schemas) {
    await resolveRelationContent(
      options.config,
      blocks.map((block, i) => ({ type: block.type, content: contents[i]! })),
      options.schemas,
      locale,
    );
  }

  return Promise.all(
    blocks.map(async (block, i) => {
      const content = contents[i]!;
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
