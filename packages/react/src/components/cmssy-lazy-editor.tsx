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

  // An explicit, layout-neutral marker that the edit bridge is mounted. It is
  // rendered before the blocks arrive and on the server, because a smoke test
  // has to be able to ASK the page whether it is editable. The old check matched
  // bundler artifacts - a chunk name, an island's component name - which meant
  // it passed on Next and Astro by accident and found nothing on React Router.
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
