import type {
  CmssyBlockPage,
  CmssyFormDefinition,
  CmssyLayoutGroup,
} from "@cmssy/core";
import { buildBlockContext } from "@cmssy/core/internal";
import { buildBlockMap, type BlockDefinition } from "../registry";
import { CmssyBlock } from "./cmssy-block";

export interface CmssyLayoutRegionProps {
  groups: CmssyLayoutGroup[];
  region: string;
  blocks: BlockDefinition[];
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  page?: CmssyBlockPage;
  blockData?: Record<string, unknown>;
  blockContent?: Record<string, Record<string, unknown>>;
  forms?: Record<string, CmssyFormDefinition>;
  appContext?: Record<string, unknown>;
  isPreview?: boolean;
  editMode?: boolean;
}

export function CmssyLayoutRegion({
  groups,
  region,
  blocks,
  locale,
  defaultLocale,
  enabledLocales,
  page,
  blockData,
  blockContent,
  forms,
  appContext,
  isPreview = false,
  editMode = false,
}: CmssyLayoutRegionProps) {
  const group = groups.find((candidate) => candidate.region === region);
  const regionBlocks = group
    ? group.blocks
        .filter((block) => block.isActive !== false)
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];
  if (regionBlocks.length === 0) return null;

  const blockMap = buildBlockMap(blocks);
  const context = buildBlockContext(
    locale,
    defaultLocale,
    enabledLocales,
    isPreview,
    forms,
    { page, app: appContext },
  );

  return (
    <>
      {regionBlocks.map((block) => (
        <CmssyBlock
          key={block.id}
          block={block}
          blockMap={blockMap}
          locale={locale}
          defaultLocale={defaultLocale}
          context={context}
          layoutRegion={region}
          editMode={editMode}
          resolvedContent={blockContent?.[block.id]}
          data={blockData?.[block.id]}
        />
      ))}
    </>
  );
}
