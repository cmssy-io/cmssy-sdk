import type { ComponentType } from "react";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import {
  fetchPage,
  resolveForms,
  resolveSiteLocales,
  splitLocaleFromPath,
  CmssyServerPage,
  type BlockDefinition,
  type CmssyClientConfig,
  type CmssyFormDefinition,
  type CmssyPageData,
} from "@cmssy/react";
import type { EditBridgeConfig } from "@cmssy/react/client";
import type { CmssyNextConfig } from "./config";
import { toCspOrigin } from "./csp";

export interface CmssyEditorProps {
  page: CmssyPageData;
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  edit: EditBridgeConfig;
  forms?: Record<string, CmssyFormDefinition>;
}

export interface CreateCmssyPageOptions {
  editor?: ComponentType<CmssyEditorProps>;
}

interface CatchAllParams {
  path?: string[];
}

type SearchParams = Record<string, string | string[] | undefined>;

interface CatchAllProps {
  params: Promise<CatchAllParams>;
  searchParams?: Promise<SearchParams>;
}

const EDIT_QUERY_PARAM = "cmssyEdit";

function hasEditFlag(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.includes("1") : value === "1";
}

export function createCmssyPage(
  config: CmssyNextConfig,
  blocks: BlockDefinition[],
  options?: CreateCmssyPageOptions,
) {
  if (!Array.isArray(blocks)) {
    throw new Error(
      "cmssy: createCmssyPage(config, blocks) requires a blocks array — pass your defineBlock(...) array",
    );
  }
  const Editor = options?.editor;
  const clientConfig: CmssyClientConfig = {
    apiUrl: config.apiUrl,
    workspaceSlug: config.workspaceSlug,
  };
  return async function CmssyCatchAllPage({
    params,
    searchParams,
  }: CatchAllProps) {
    const { path } = await params;
    const { isEnabled } = await draftMode();
    const query = searchParams ? await searchParams : {};
    const editMode = isEnabled || hasEditFlag(query[EDIT_QUERY_PARAM]);

    let locale: string;
    let pagePath = path;
    let defaultLocale: string;
    let enabledLocales = config.enabledLocales;

    if (config.resolveLocale) {
      defaultLocale = config.defaultLocale ?? "en";
      locale = await config.resolveLocale();
    } else {
      const siteLocales = await resolveSiteLocales(clientConfig);
      defaultLocale = config.defaultLocale ?? siteLocales.defaultLocale;
      const locales = config.enabledLocales ?? siteLocales.locales;
      enabledLocales = locales;
      const split = splitLocaleFromPath(path, { defaultLocale, locales });
      locale = split.locale;
      pagePath = split.path;
    }

    const page = await fetchPage(clientConfig, pagePath, {
      previewSecret: editMode ? config.draftSecret : undefined,
    });

    if (!page) {
      notFound();
    }

    if (editMode && !Editor) {
      throw new Error(
        'cmssy: edit mode requires options.editor — pass a "use client" editor that imports your blocks and renders <CmssyEditablePage blocks={blocks} … />',
      );
    }

    const resolvedForms = await resolveForms(
      clientConfig,
      page.blocks,
      locale,
      defaultLocale,
    );
    const forms =
      Object.keys(resolvedForms).length > 0 ? resolvedForms : undefined;

    if (editMode && Editor) {
      const bridgeOrigin = resolveBridgeOrigin(config.editorOrigin);
      return (
        <Editor
          page={page}
          locale={locale}
          defaultLocale={defaultLocale}
          enabledLocales={enabledLocales}
          edit={{ editorOrigin: bridgeOrigin }}
          forms={forms}
        />
      );
    }

    return (
      <CmssyServerPage
        page={page}
        blocks={blocks}
        locale={locale}
        defaultLocale={defaultLocale}
        enabledLocales={enabledLocales}
        forms={forms}
      />
    );
  };
}

function resolveBridgeOrigin(editorOrigin: string | string[]): string {
  const origins = Array.isArray(editorOrigin) ? editorOrigin : [editorOrigin];
  if (origins.length === 0) {
    throw new Error("cmssy: editorOrigin must be set to frame the editor");
  }
  if (origins.length > 1 && typeof console !== "undefined") {
    console.warn(
      "[cmssy] multiple editorOrigins configured; the live-edit bridge uses only the first",
    );
  }
  const origin = toCspOrigin(origins[0]!.trim());
  if (origin === "*") {
    throw new Error(
      "cmssy: editorOrigin '*' is not allowed for the live-edit bridge; set the concrete editor origin (e.g. https://app.cmssy.io)",
    );
  }
  return origin;
}
