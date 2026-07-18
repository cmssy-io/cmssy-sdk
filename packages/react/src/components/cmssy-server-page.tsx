import type { CmssyClientConfig, CmssyPageData } from "@cmssy/core";
import type { CmssyFormDefinition } from "@cmssy/core";
import {
  blocksToSchemas,
  buildBlockMap,
  buildLoaderMap,
  type BlockDefinition,
} from "../registry";
import {
  buildBlockContext,
  type CmssyBlockAuthContext,
  type CmssyBlockWorkspace,
} from "@cmssy/core";
import { renderResolvedBlock } from "./render-resolved-block";
import { resolveBlocks } from "./resolve-blocks";
import { resolveRenderLocale } from "./resolve-render-locale";

export interface CmssyServerPageProps {
  page: CmssyPageData | null;
  blocks: BlockDefinition[];
  locale?: string;
  defaultLocale?: string;
  /** All languages enabled on the workspace; exposed to blocks via context.locale.enabled. */
  enabledLocales?: string[];
  /**
   * The workspace, so the languages can be looked up when they are not passed.
   * Without it the SDK has to guess, and its guess is "en".
   */
  config?: CmssyClientConfig;
  /** Form definitions referenced by page blocks, exposed via context.forms. */
  forms?: Record<string, CmssyFormDefinition>;
  /** Member auth state, exposed via context.auth. Resolved by createCmssyPage. */
  auth?: CmssyBlockAuthContext;
  /** Workspace identity, exposed via context.workspace. Resolved by createCmssyPage. */
  workspace?: CmssyBlockWorkspace;
  editMode?: boolean;
}

/**
 * Async React Server Component (Next.js App Router / RSC). It runs each block's
 * loader server-side before rendering, so it must be rendered in a server
 * component tree (as `createCmssyPage` does) - not in a client component.
 */
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
    { auth, workspace },
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
