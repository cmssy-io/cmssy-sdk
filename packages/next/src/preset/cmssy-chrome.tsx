import type { ReactNode } from "react";
import {
  CmssyServerLayout,
  fetchLayouts,
  resolveSiteLocales,
  type BlockDefinition,
  type CmssyLayoutGroup,
} from "@cmssy/react";
import { resolveEditorOrigin, type CmssyNextConfig } from "../config";
import { isCmssyEditMode } from "../edit-mode";
import { getCmssyLocale } from "../locale";

export interface CmssyChromeProps {
  config: CmssyNextConfig;
  blocks: BlockDefinition[];
  position: string;
  /**
   * The page whose layout to render. Defaults to "/" - the site chrome.
   */
  page?: string;
  /**
   * Renders the layout blocks through the edit bridge. Pass the consumer's
   * client wrapper around CmssyLazyLayout; without it the header and the footer
   * are markup the editor can select and cannot fill.
   */
  editable?: (props: {
    groups: CmssyLayoutGroup[];
    position: string;
    locale: string;
    defaultLocale: string;
    enabledLocales: string[];
    edit: { editorOrigin: string };
  }) => ReactNode;
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
export async function CmssyChrome({
  config,
  blocks,
  position,
  page = "/",
  editable,
}: CmssyChromeProps) {
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
    return editable({
      groups,
      position,
      locale,
      defaultLocale: siteLocales.defaultLocale,
      enabledLocales: siteLocales.locales,
      edit: { editorOrigin: (Array.isArray(origin) ? origin[0] : origin) ?? "" },
    });
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
