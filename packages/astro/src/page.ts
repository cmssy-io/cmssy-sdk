import {
  CMSSY_EDIT_HEADER,
  isVerifiedEditUrl,
  type CmssyConfig,
  type CmssyLayoutGroup,
  type CmssyPageData,
} from "@cmssy/core";
import { CMSSY_LOCALE_HEADER, fetchPage } from "@cmssy/core/internal";
import {
  resolveCmssyLayoutSlot,
  type BlockDefinition,
} from "@cmssy/react";

import { CMSSY_EDIT_PATH_PREFIX } from "./middleware";

/** On the segment, so `/cmssy-editorial` stays a page rather than a slug. */
function withoutEditPrefix(pathname: string): string {
  if (pathname === CMSSY_EDIT_PATH_PREFIX) return "/";
  return pathname.startsWith(`${CMSSY_EDIT_PATH_PREFIX}/`)
    ? pathname.slice(CMSSY_EDIT_PATH_PREFIX.length)
    : pathname;
}

export interface CmssyPageResult {
  page: CmssyPageData | null;
  layouts: CmssyLayoutGroup[];
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  /** True for a verified editor request. The edit route renders the bridge. */
  isEdit: boolean;
  /**
   * Edit mode only, and only when `blocks` was passed: what the canvas needs,
   * **keyed by position**. The header and the footer hold different blocks, so
   * they resolve to different data - handing the footer the header's is the
   * quiet version of this bug.
   *
   * Without `resolvedContent` a relation field shows the raw ids it stores,
   * which is what this adapter did until now.
   */
  editorData?: Record<string, CmssyLayoutEditorData>;
  editorOrigin?: string | string[];
}

export interface CmssyLayoutEditorData {
  data: Record<string, unknown>;
  resolvedContent: Record<string, Record<string, unknown>>;
}

export interface LoadCmssyPageOptions {
  /**
   * The block registry. Required to resolve the editor's layout data; omit it
   * and the layouts still render, but the editor cannot fill them.
   */
  blocks?: BlockDefinition[];
  /** Which positions the editor renders. Defaults to the header and footer. */
  positions?: string[];
  appContext?: Record<string, unknown>;
}

/**
 * Everything a cmssy page needs, from a plain Request. No framework globals.
 *
 * The layout half is `resolveCmssyLayoutSlot` from `@cmssy/react` - the same
 * function the Next adapter uses, so the preview secret, the language and the
 * editor data are decided in one place for all three frameworks rather than
 * three times with two of them wrong.
 */
export async function loadCmssyPage(
  config: CmssyConfig,
  request: Request,
  url: URL,
  options: LoadCmssyPageOptions = {},
): Promise<CmssyPageResult> {
  // Two signals, because one of them does not survive the trip. The middleware
  // sets the header and rewrites onto /cmssy-edit, and Astro builds a fresh
  // request for the rewritten route - so on the edit page the header is gone.
  // Verifying the URL is what React Router has always done; the header stays
  // for anything that reaches this without a rewrite.
  const isEdit =
    request.headers.get(CMSSY_EDIT_HEADER) === "1" ||
    (await isVerifiedEditUrl(url, config));

  const segments = withoutEditPrefix(url.pathname).split("/").filter(Boolean);

  const positions = options.positions ?? ["header", "footer"];
  const blocks = options.blocks ?? [];
  // This adapter's routes are always dynamic, so the header the middleware set
  // IS readable here - unlike on a cached Next route. Keeping the preference it
  // has always had; the resolver never reads a header itself.
  const headerLocale = request.headers.get(CMSSY_LOCALE_HEADER) ?? undefined;

  const slot = await resolveCmssyLayoutSlot(config, {
    position: positions[0] ?? "header",
    blocks,
    editMode: isEdit,
    path: segments,
    locale: headerLocale,
    appContext: options.appContext,
  });

  const page = await fetchPage(config, slot.path, {
    previewSecret: isEdit ? config.draftSecret : undefined,
  });

  let editorData: Record<string, CmssyLayoutEditorData> | undefined;
  if (isEdit && slot.data && slot.resolvedContent) {
    editorData = {
      [positions[0] ?? "header"]: {
        data: slot.data,
        resolvedContent: slot.resolvedContent,
      },
    };
    // Each position resolves its own blocks. One call per position, in edit
    // mode only - the published render needs none of this.
    for (const position of positions.slice(1)) {
      const extra = await resolveCmssyLayoutSlot(config, {
        position,
        blocks,
        editMode: true,
        path: segments,
        locale: headerLocale,
        appContext: options.appContext,
      });
      if (extra.data && extra.resolvedContent) {
        editorData[position] = {
          data: extra.data,
          resolvedContent: extra.resolvedContent,
        };
      }
    }
  }

  return {
    page,
    layouts: slot.groups,
    locale: slot.locale,
    defaultLocale: slot.defaultLocale,
    enabledLocales: slot.enabledLocales,
    isEdit,
    editorData,
    editorOrigin: slot.editorOrigin,
  };
}
