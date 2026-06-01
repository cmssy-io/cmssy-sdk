import type { CmssyPageData } from "../content/content-client";
import { useEditBridge, type EditBridgeConfig } from "../bridge/use-edit-bridge";
import { CmssyBlock } from "./cmssy-block";

export interface CmssyPageProps {
  page: CmssyPageData | null;
  locale?: string;
  defaultLocale?: string;
  edit?: EditBridgeConfig;
}

export function CmssyPage({
  page,
  locale = "en",
  defaultLocale = "en",
  edit,
}: CmssyPageProps) {
  if (!page) return null;
  if (edit) {
    return (
      <EditableBlocks
        page={page}
        locale={locale}
        defaultLocale={defaultLocale}
        edit={edit}
      />
    );
  }
  return (
    <>
      {page.blocks.map((block) => (
        <CmssyBlock
          key={block.id}
          block={block}
          locale={locale}
          defaultLocale={defaultLocale}
        />
      ))}
    </>
  );
}

interface EditableBlocksProps {
  page: CmssyPageData;
  locale: string;
  defaultLocale: string;
  edit: EditBridgeConfig;
}

function EditableBlocks({
  page,
  locale,
  defaultLocale,
  edit,
}: EditableBlocksProps) {
  const { patches } = useEditBridge(page.blocks, edit);
  return (
    <>
      {page.blocks.map((block) => (
        <CmssyBlock
          key={block.id}
          block={block}
          locale={locale}
          defaultLocale={defaultLocale}
          patchedContent={patches[block.id]}
        />
      ))}
    </>
  );
}
