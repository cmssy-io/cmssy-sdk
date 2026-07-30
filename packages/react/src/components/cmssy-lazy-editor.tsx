"use client";

import { useEffect, useState } from "react";
import type { CmssyPageData } from "@cmssy/core";
import type { CmssyFormDefinition } from "@cmssy/core";
import type { BlockDefinition } from "../registry";
import type { EditBridgeConfig } from "../bridge/use-edit-bridge";
import { CmssyEditablePage } from "./editable-page";

export interface CmssyLazyEditorProps {
  page: CmssyPageData | null;
  locale?: string;
  defaultLocale?: string;
  enabledLocales?: string[];
  edit: EditBridgeConfig;
  forms?: Record<string, CmssyFormDefinition>;
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
  appContext?: Record<string, unknown>;
  load: () => Promise<{ blocks: BlockDefinition[]; category?: string }>;
}

export function CmssyLazyEditor({ load, ...props }: CmssyLazyEditorProps) {
  const [loaded, setLoaded] = useState<{
    blocks: BlockDefinition[];
    category?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setLoaded(null);
    (async () => {
      try {
        const m = await load();
        if (!active) return;
        if (!Array.isArray(m.blocks)) {
          throw new Error(
            "cmssy: CmssyLazyEditor load() must resolve to { blocks: BlockDefinition[] }",
          );
        }
        setLoaded({ blocks: m.blocks, category: m.category });
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error("[cmssy] CmssyLazyEditor failed to load blocks", err);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  return (
    <>
      <div data-cmssy-editor="1" hidden />
      {loaded ? (
        <CmssyEditablePage
          {...props}
          blocks={loaded.blocks}
          category={loaded.category}
        />
      ) : null}
    </>
  );
}
