import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { CmssyPage, fetchPage, type CmssyClientConfig } from "@cmssy/react";
import { CmssyEditablePage } from "@cmssy/react/client";
import type { CmssyNextConfig } from "./config";
import { toCspOrigin } from "./csp";

interface CatchAllParams {
  path?: string[];
}

interface CatchAllProps {
  params: Promise<CatchAllParams>;
}

export function createCmssyPage(config: CmssyNextConfig) {
  const clientConfig: CmssyClientConfig = {
    apiUrl: config.apiUrl,
    workspaceSlug: config.workspaceSlug,
  };
  const defaultLocale = config.defaultLocale ?? "en";
  const bridgeOrigin = resolveBridgeOrigin(config.editorOrigin);

  return async function CmssyCatchAllPage({ params }: CatchAllProps) {
    const { path } = await params;
    const { isEnabled } = await draftMode();
    const locale = config.resolveLocale
      ? await config.resolveLocale()
      : defaultLocale;

    const page = await fetchPage(clientConfig, path, {
      previewSecret: isEnabled ? config.draftSecret : undefined,
    });

    if (!page) {
      notFound();
    }

    if (isEnabled) {
      return (
        <CmssyEditablePage
          page={page}
          locale={locale}
          defaultLocale={defaultLocale}
          edit={{ editorOrigin: bridgeOrigin }}
        />
      );
    }

    return (
      <CmssyPage page={page} locale={locale} defaultLocale={defaultLocale} />
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
  return toCspOrigin(origins[0]!.trim());
}
