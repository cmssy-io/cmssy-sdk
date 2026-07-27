import type {
  CmssyConfig,
  CmssyFormDefinition,
  CmssyLayoutGroup,
} from "@cmssy/core";
import { fetchLayouts } from "@cmssy/core/internal";
import {
  resolveSiteLocales,
  splitLocaleFromPath,
} from "@cmssy/core/internal/locale";
import { resolveEditorOrigin } from "@cmssy/core";
import type { BlockDefinition } from "../registry";
import { resolveEditorLayoutBlockData } from "./resolve-block-data";

interface ResolveCmssyLayoutSlotBase {
  position: string;
  blocks: BlockDefinition[];
  /**
   * Whether to resolve for the edit bridge. A parameter, never a lookup: every
   * way of asking the request is a dynamic API on Next, and one read makes the
   * route uncacheable. Each adapter knows the answer already - from its own
   * request object, or from the route segment.
   */
  editMode: boolean;
  /**
   * Whose layouts to render. Defaults to the routed page, which is what a page
   * with its own header needs; pass `"/"` for the site-wide chrome.
   */
  page?: string;
  forms?: Record<string, CmssyFormDefinition>;
  appContext?: Record<string, unknown>;
}

/**
 * Where the language comes from - one of two, never neither.
 *
 * `path` is the routed segments: the language prefix in them IS the language,
 * and it is also where the page slug comes from. `locale` overrides the
 * language without touching the slug, which is what an always-dynamic adapter
 * wants when the proxy already resolved it into a header.
 *
 * What this deliberately does NOT do is read that header itself. On a cacheable
 * route it is not there to read, and a fallback would render the wrong language
 * while looking like it worked.
 */
export type CmssyLayoutSlotLocaleSource =
  | { path: string[]; locale?: string }
  | { locale: string; path?: undefined };

export type ResolveCmssyLayoutSlotOptions = ResolveCmssyLayoutSlotBase &
  CmssyLayoutSlotLocaleSource;

export interface CmssyLayoutSlotResolution {
  groups: CmssyLayoutGroup[];
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  /**
   * The routed segments with the language prefix removed - the page slug. It is
   * returned because every caller needs it next, and resolving it twice is how
   * the three adapters drifted apart in the first place.
   */
  path: string[];
  /** Edit mode only: the loader data and the server-resolved content. */
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
  /**
   * Edit mode only, and unchanged: `string | string[]`. The bridge handles a
   * list natively and the default is two origins - collapsing it to the first
   * silently breaks an editor served from the second.
   */
  editorOrigin?: string | string[];
}

/**
 * Everything a layout slot needs, for any framework.
 *
 * Three things have to be right here, and each was got wrong at least once by
 * an app that wrote this by hand:
 *
 *  1. in edit mode the layouts are fetched **with the preview secret** -
 *     otherwise you edit the draft header and the editor shows the published
 *     one;
 *  2. the language comes from the routed path, not from a request header;
 *  3. the editor gets `resolvedContent` as well as `data` - the canvas renders
 *     stored content, where a relation field is raw ids.
 *
 * Rendering stays with the caller: three frameworks, three rendering models.
 * This is the half that is the same in all of them.
 */
export async function resolveCmssyLayoutSlot(
  config: CmssyConfig,
  options: ResolveCmssyLayoutSlotOptions,
): Promise<CmssyLayoutSlotResolution> {
  const {
    position,
    blocks,
    editMode,
    page,
    forms,
    appContext,
    path,
    locale: explicitLocale,
  } = options;

  const siteLocales = await resolveSiteLocales(config);
  const fromPath = path
    ? splitLocaleFromPath(path, siteLocales)
    : { locale: siteLocales.defaultLocale, path: [] };

  const locale = explicitLocale ?? fromPath.locale;
  const slugSegments = fromPath.path ?? [];
  const pageSlug = page ?? "/" + slugSegments.join("/");

  const groups = await fetchLayouts(config, pageSlug, {
    previewSecret: editMode ? config.draftSecret : undefined,
  });

  const base = {
    groups,
    locale,
    defaultLocale: siteLocales.defaultLocale,
    enabledLocales: siteLocales.locales,
    path: slugSegments,
  };

  if (!editMode) return base;

  const editorData = await resolveEditorLayoutBlockData({
    groups,
    blocks,
    position,
    locale,
    defaultLocale: siteLocales.defaultLocale,
    enabledLocales: siteLocales.locales,
    forms,
    isPreview: true,
    config,
    appContext,
  });

  return {
    ...base,
    data: editorData.data,
    resolvedContent: editorData.content,
    editorOrigin: resolveEditorOrigin(config.editorOrigin),
  };
}
