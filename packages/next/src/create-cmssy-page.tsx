import type { ComponentType } from "react";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import {
  fetchPage,
  CmssyServerPage,
  type BlockDefinition,
  type CmssyClientConfig,
  type CmssyPageData,
} from "@cmssy/react";
import { CmssyClientPage, CmssyEditablePage } from "@cmssy/react/client";
import type { EditBridgeConfig } from "@cmssy/react/client";
import type { CmssyNextConfig } from "./config";
import { toCspOrigin } from "./csp";

export interface CmssyEditorProps {
  page: CmssyPageData;
  locale: string;
  defaultLocale: string;
  edit: EditBridgeConfig;
}

export interface CreateCmssyPageOptions {
  /**
   * Consumer-supplied `"use client"` editor that imports the block array in its
   * own module graph and renders `<CmssyEditablePage blocks={blocks} …/>`. This
   * is how edit mode reaches the static block components without crossing the
   * server→client prop boundary (plain server-component refs cannot be passed
   * as props). Falls back to the global registry when omitted.
   */
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
  blocks?: BlockDefinition[],
  options?: CreateCmssyPageOptions,
) {
  const Editor = options?.editor;
  const clientConfig: CmssyClientConfig = {
    apiUrl: config.apiUrl,
    workspaceSlug: config.workspaceSlug,
  };
  const defaultLocale = config.defaultLocale ?? "en";
  const bridgeOrigin = resolveBridgeOrigin(config.editorOrigin);

  return async function CmssyCatchAllPage({
    params,
    searchParams,
  }: CatchAllProps) {
    const { path } = await params;
    const { isEnabled } = await draftMode();
    const query = searchParams ? await searchParams : {};
    const editMode = isEnabled || hasEditFlag(query[EDIT_QUERY_PARAM]);
    const locale = config.resolveLocale
      ? await config.resolveLocale()
      : defaultLocale;

    const page = await fetchPage(clientConfig, path, {
      previewSecret: editMode ? config.draftSecret : undefined,
    });

    if (!page) {
      notFound();
    }

    if (editMode) {
      if (Editor) {
        return (
          <Editor
            page={page}
            locale={locale}
            defaultLocale={defaultLocale}
            edit={{ editorOrigin: bridgeOrigin }}
          />
        );
      }
      return (
        <CmssyEditablePage
          page={page}
          locale={locale}
          defaultLocale={defaultLocale}
          edit={{ editorOrigin: bridgeOrigin }}
        />
      );
    }

    if (blocks) {
      return (
        <CmssyServerPage
          page={page}
          blocks={blocks}
          locale={locale}
          defaultLocale={defaultLocale}
        />
      );
    }

    return (
      <CmssyClientPage
        page={page}
        locale={locale}
        defaultLocale={defaultLocale}
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
