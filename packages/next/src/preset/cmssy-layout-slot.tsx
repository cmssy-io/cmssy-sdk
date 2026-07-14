import type { ComponentType } from "react";
import {
  CmssyServerLayout,
  fetchLayouts,
  resolveSiteLocales,
  type BlockDefinition,
  type CmssyLayoutGroup,
} from "@cmssy/react";
import { resolveEditorOrigin, type CmssyConfig } from "@cmssy/core";
import { isCmssyEditMode } from "../edit-mode";
import { getCmssyLocale } from "../locale";

export interface CmssyLayoutSlotProps {
  config: CmssyConfig;
  blocks: BlockDefinition[];
  position: string;
  /**
   * The page whose layout to render. Defaults to "/" - the site chrome.
   */
  page?: string;
  /**
   * The client wrapper around CmssyLazyLayout, rendered in edit mode. Without it
   * the header and the footer are markup the editor can select and cannot fill.
   *
   * A COMPONENT, not a function to call: it lives on the client, and the server
   * can only render it.
   */
  editable?: ComponentType<{
    groups: CmssyLayoutGroup[];
    position: string;
    locale: string;
    defaultLocale: string;
    enabledLocales: string[];
    edit: { editorOrigin: string };
  }>;
}

/**
 * The site chrome, rendered the way each mode needs it:
 *
 *  - published traffic: server-rendered layout blocks (static, no client cost);
 *  - the editor: the same blocks through the edit bridge, fetched with the
 *    preview secret, so what you see is the draft you are editing.
 *
 * Getting this wrong is invisible - the site looks right and the editor shows a
 * header it cannot edit, or the published version of one. Both shipped before.
 */
export async function CmssyLayoutSlot({
  config,
  blocks,
  position,
  page = "/",
  editable,
}: CmssyLayoutSlotProps) {
  const editMode = await isCmssyEditMode();

  const [groups, locale, siteLocales] = await Promise.all([
    fetchLayouts(
      config,
      page,
      editMode ? { previewSecret: config.draftSecret } : undefined,
    ),
    getCmssyLocale(config),
    resolveSiteLocales(config),
  ]);

  if (editMode && editable) {
    const origin = resolveEditorOrigin(config.editorOrigin);
    const Editable = editable;
    return (
      <Editable
        groups={groups}
        position={position}
        locale={locale}
        defaultLocale={siteLocales.defaultLocale}
        enabledLocales={siteLocales.locales}
        edit={{
          editorOrigin: (Array.isArray(origin) ? origin[0] : origin) ?? "",
        }}
      />
    );
  }

  return (
    <CmssyServerLayout
      groups={groups}
      blocks={blocks}
      position={position}
      locale={locale}
      defaultLocale={siteLocales.defaultLocale}
      enabledLocales={siteLocales.locales}
    />
  );
}
