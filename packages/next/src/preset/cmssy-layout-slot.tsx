import type { ComponentType } from "react";
import {
  CmssyServerLayout,
  resolveEditorLayoutBlockData,
  type BlockDefinition,
  type CmssyLayoutGroup,
} from "@cmssy/react";
import {
  resolveEditorOrigin,
  type CmssyConfig,
  type LayoutPosition,
} from "@cmssy/core";
import { fetchLayouts } from "@cmssy/core/internal";
import {
  CMSSY_LOCALE_HEADER,
  resolveSiteLocales,
  splitLocaleFromPath,
} from "@cmssy/core/internal/locale";
import { isCmssyEditMode } from "../edit-mode";

export interface CmssyLayoutSlotProps {
  config: CmssyConfig;
  blocks: BlockDefinition[];
  /**
   * Which layout position to render. Six exist - `top`, `header`,
   * `sidebar_left`, `sidebar_right`, `footer`, `bottom` - and most sites use
   * two of them; the type is what tells you about the other four.
   */
  position: LayoutPosition;
  /**
   * The catch-all segments of the route rendering this slot, **as routed**.
   * The language prefix in them IS the language, and reading it here keeps the
   * route statically renderable.
   *
   * Omit it only where there are no params to read - a root layout - and the
   * language falls back to the header the middleware set, which means calling
   * `headers()` and giving up static rendering for the whole route. The version
   * of this component removed in 10.0 had no choice about that; this one does.
   */
  path?: string[];
  /** The page whose layout to render. Defaults to the site-wide header/footer. */
  page?: string;
  /**
   * The client wrapper around `CmssyLazyLayout`, rendered in edit mode.
   *
   * Required, and a component rather than a loader: the block registry has to
   * be imported lazily ON THE CLIENT, and a function cannot cross the server
   * boundary. Without it the editor gets a header it can select and not fill -
   * which is why this is a type error rather than a runtime warning.
   */
  editable: ComponentType<{
    groups: CmssyLayoutGroup[];
    position: string;
    locale: string;
    defaultLocale: string;
    enabledLocales: string[];
    edit: { editorOrigin: string };
    data?: Record<string, unknown>;
    resolvedContent?: Record<string, Record<string, unknown>>;
    appContext?: Record<string, unknown>;
  }>;
  /** Forwarded untouched to every block as `context.app`. */
  appContext?: Record<string, unknown>;
}

/**
 * The site-wide header and footer, which are layout **blocks** rather than
 * markup the app owns. Rendered the way each mode needs them:
 *
 *  - published traffic: server-rendered blocks, no client cost;
 *  - the editor: the same blocks through the edit bridge, fetched with the
 *    preview secret and handed their server-resolved content, so a relation
 *    field shows records rather than the ids it stores.
 *
 * Getting any of that wrong is invisible - the site looks right while the
 * editor shows a header it cannot fill, or the published version of one. Every
 * app that wrote this by hand between 10.0 and 10.9 got at least one of the
 * three wrong, which is why it is back.
 */
export async function CmssyLayoutSlot({
  config,
  blocks,
  position,
  path,
  page = "/",
  editable: Editable,
  appContext,
}: CmssyLayoutSlotProps) {
  const editMode = await isCmssyEditMode();

  const [groups, siteLocales] = await Promise.all([
    fetchLayouts(config, page, {
      previewSecret: editMode ? config.draftSecret : undefined,
    }),
    resolveSiteLocales(config),
  ]);

  const locale = path
    ? splitLocaleFromPath(path, siteLocales).locale
    : await localeFromHeader(siteLocales.defaultLocale);

  if (!editMode) {
    return (
      <CmssyServerLayout
        groups={groups}
        blocks={blocks}
        position={position}
        locale={locale}
        defaultLocale={siteLocales.defaultLocale}
        enabledLocales={siteLocales.locales}
        config={config}
        appContext={appContext}
      />
    );
  }

  const origin = resolveEditorOrigin(config.editorOrigin);
  const editorData = await resolveEditorLayoutBlockData({
    groups,
    blocks,
    position,
    locale,
    defaultLocale: siteLocales.defaultLocale,
    enabledLocales: siteLocales.locales,
    isPreview: true,
    config,
    appContext,
  });

  return (
    <Editable
      groups={groups}
      position={position}
      locale={locale}
      defaultLocale={siteLocales.defaultLocale}
      enabledLocales={siteLocales.locales}
      edit={{ editorOrigin: (Array.isArray(origin) ? origin[0] : origin) ?? "" }}
      data={editorData.data}
      resolvedContent={editorData.content}
      appContext={appContext}
    />
  );
}

/** The language the middleware resolved. Reading it opts the route out of static. */
async function localeFromHeader(defaultLocale: string): Promise<string> {
  const { headers } = await import("next/headers");
  return (await headers()).get(CMSSY_LOCALE_HEADER) || defaultLocale;
}
