import type {
  CmssyBlockAuthContext,
  CmssyBlockPage,
  CmssyBlockWorkspace,
  CmssyFormDefinition,
  CmssyPageData,
} from "@cmssy/core";
import { buildBlockContext } from "@cmssy/core/internal";
import { buildBlockMap, type BlockDefinition } from "../registry";
import { CmssyBlock } from "./cmssy-block";

export interface CmssyBlocksProps {
  page: CmssyPageData | null;
  blocks: BlockDefinition[];
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  blockData?: Record<string, unknown>;
  blockContent?: Record<string, Record<string, unknown>>;
  pageContext?: CmssyBlockPage;
  forms?: Record<string, CmssyFormDefinition>;
  auth?: CmssyBlockAuthContext;
  workspace?: CmssyBlockWorkspace;
  appContext?: Record<string, unknown>;
  isPreview?: boolean;
  editMode?: boolean;
}

export function CmssyBlocks({
  page,
  blocks,
  locale,
  defaultLocale,
  enabledLocales,
  blockData,
  blockContent,
  pageContext,
  forms,
  auth,
  workspace,
  appContext,
  isPreview = false,
  editMode = false,
}: CmssyBlocksProps) {
  if (!page) return null;

  const blockMap = buildBlockMap(blocks);
  const context = buildBlockContext(
    locale,
    defaultLocale,
    enabledLocales,
    isPreview,
    forms,
    { page: pageContext, auth, workspace, app: appContext },
  );

  return (
    <>
      {(page.blocks ?? []).map((block) => (
        <CmssyBlock
          key={block.id}
          block={block}
          blockMap={blockMap}
          locale={locale}
          defaultLocale={defaultLocale}
          context={context}
          editMode={editMode}
          resolvedContent={blockContent?.[block.id]}
          data={blockData?.[block.id]}
        />
      ))}
    </>
  );
}
