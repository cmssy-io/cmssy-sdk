"use client";

import { useEffect, useState } from "react";
import type { CmssyLayoutGroup } from "@cmssy/core";
import type { BlockDefinition } from "../registry";
import type { EditBridgeConfig } from "../bridge/use-edit-bridge";
import { CmssyEditableLayout } from "./cmssy-editable-layout";

export interface CmssyLazyLayoutProps {
  groups: CmssyLayoutGroup[];
  position: string;
  locale?: string;
  defaultLocale?: string;
  enabledLocales?: string[];
  edit: EditBridgeConfig;
  data?: Record<string, unknown>;
  load: () => Promise<{ blocks: BlockDefinition[] }>;
}

export function CmssyLazyLayout({ load, ...props }: CmssyLazyLayoutProps) {
  const [blocks, setBlocks] = useState<BlockDefinition[] | null>(null);

  useEffect(() => {
    let active = true;
    setBlocks(null);
    (async () => {
      try {
        const m = await load();
        if (!active) return;
        if (!Array.isArray(m.blocks)) {
          throw new Error(
            "cmssy: CmssyLazyLayout load() must resolve to { blocks: BlockDefinition[] }",
          );
        }
        setBlocks(m.blocks);
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error("[cmssy] CmssyLazyLayout failed to load blocks", err);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  if (!blocks) return null;
  return <CmssyEditableLayout {...props} blocks={blocks} />;
}
