import type { CmssyPageData } from "../content/content-client";
import { useEditBridge, type EditBridgeConfig } from "../bridge/use-edit-bridge";
import { CmssyBlock } from "./cmssy-block";

export interface CmssyEditablePageProps {
  page: CmssyPageData | null;
  locale?: string;
  defaultLocale?: string;
  edit: EditBridgeConfig;
}

export function CmssyEditablePage({
  page,
  locale = "en",
  defaultLocale = "en",
  edit,
}: CmssyEditablePageProps) {
  if (!page) return null;
  return (
    <EditableBlocks
      page={page}
      locale={locale}
      defaultLocale={defaultLocale}
      edit={edit}
    />
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
  const { patches } = useEditBridge(page, edit);
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
