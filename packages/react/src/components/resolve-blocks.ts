import type { CmssyClientConfig, RawBlock } from "@cmssy/core";
import {
  getBlockContentForLanguage,
  normalizeBlockContent,
  resolveRelationContent,
  type BlockSchemaMap,
} from "@cmssy/core/internal";
import type { LoaderMap } from "../registry";
import type { CmssyBlockContext } from "@cmssy/core";
import { blockErrorMessage, type CmssyBlockError } from "./block-error";

export interface ResolvedBlock {
  content: Record<string, unknown>;
  data: unknown;
  error?: CmssyBlockError;
}

export interface ResolveBlocksOptions {
  schemas?: BlockSchemaMap;
  config?: CmssyClientConfig;
  workspaceId?: string;
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

  const schemas = options?.schemas;
  if (schemas) {
    if (options?.config) {
      await resolveRelationContent(
        options.config,
        blocks.map((block, i) => ({ type: block.type, content: contents[i]! })),
        schemas,
        locale,
        options.workspaceId ? { workspaceId: options.workspaceId } : {},
      );
    }
    blocks.forEach((block, i) => {
      const schema = schemas[block.type];
      if (schema) normalizeBlockContent(contents[i]!, schema);
    });
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
