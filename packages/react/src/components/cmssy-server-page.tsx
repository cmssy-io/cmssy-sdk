import type { CmssyClientConfig, CmssyPageData } from "@cmssy/core";
import type { CmssyFormDefinition } from "@cmssy/core";
import {
  blocksToSchemas,
  buildBlockMap,
  buildLoaderMap,
  type BlockDefinition,
} from "../registry";
import { buildBlockContext } from "@cmssy/core/internal";
import type { CmssyBlockAuthContext, CmssyBlockWorkspace } from "@cmssy/core";
import { renderResolvedBlock } from "./render-resolved-block";
import { resolveBlocks } from "./resolve-blocks";
import { resolveRenderLocale } from "./resolve-render-locale";

export interface CmssyServerPageProps {
  page: CmssyPageData | null;
  blocks: BlockDefinition[];
  locale?: string;
  defaultLocale?: string;
  enabledLocales?: string[];
  config?: CmssyClientConfig;
  forms?: Record<string, CmssyFormDefinition>;
  auth?: CmssyBlockAuthContext;
  workspace?: CmssyBlockWorkspace;
  appContext?: Record<string, unknown>;
  editMode?: boolean;
}

export async function CmssyServerPage({
  page,
  blocks,
  locale: localeProp,
  defaultLocale: defaultLocaleProp,
  enabledLocales: enabledLocalesProp,
  config,
  forms,
  auth,
  workspace,
  appContext,
  editMode,
}: CmssyServerPageProps) {
  if (!page) return null;
  const { locale, defaultLocale, enabledLocales } = await resolveRenderLocale({
    locale: localeProp,
    defaultLocale: defaultLocaleProp,
    enabledLocales: enabledLocalesProp,
    config,
  });
  const map = buildBlockMap(blocks);
  const loaderMap = buildLoaderMap(blocks);
  const context = buildBlockContext(
    locale,
    defaultLocale,
    enabledLocales,
    false,
    forms,
    { auth, workspace, page, app: appContext },
  );

  const resolved = await resolveBlocks(
    page.blocks,
    loaderMap,
    locale,
    defaultLocale,
    context,
    enabledLocales,
    { schemas: blocksToSchemas(blocks), config, workspaceId: workspace?.id },
  );

  return (
    <>
      {page.blocks.map((block, i) =>
        renderResolvedBlock(block, map, locale, defaultLocale, {
          context,
          data: resolved[i]?.data,
          resolvedContent: resolved[i]?.content,
          enabledLocales,
          error: resolved[i]?.error,
          editMode,
        }),
      )}
    </>
  );
}
