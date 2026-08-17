import type {
  CmssyConfig,
  CmssyFormDefinition,
  CmssyLayoutGroup,
  RetryPolicy,
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
  editMode: boolean;
  page?: string;
  forms?: Record<string, CmssyFormDefinition>;
  appContext?: Record<string, unknown>;
  retry?: RetryPolicy | false;
}

export type CmssyLayoutSlotLocaleSource =
  { path: string[]; locale?: string } | { locale: string; path?: undefined };

export type ResolveCmssyLayoutSlotOptions = ResolveCmssyLayoutSlotBase &
  CmssyLayoutSlotLocaleSource;

export interface CmssyLayoutSlotResolution {
  groups: CmssyLayoutGroup[];
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  path: string[];
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
  editorOrigin?: string | string[];
}

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
    retry,
  } = options;

  const requestOptions = { retry: retry ?? {} };

  const siteLocales = await resolveSiteLocales(config, requestOptions);
  const fromPath = path
    ? splitLocaleFromPath(path, siteLocales)
    : { locale: siteLocales.defaultLocale, path: [] };

  const locale = explicitLocale ?? fromPath.locale;
  const slugSegments = fromPath.path ?? [];
  const pageSlug = page ?? "/" + slugSegments.join("/");

  const groups = await fetchLayouts(config, pageSlug, {
    previewSecret: editMode ? config.draftSecret : undefined,
    ...requestOptions,
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
