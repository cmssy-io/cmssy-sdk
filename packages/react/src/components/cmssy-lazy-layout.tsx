"use client";

import { useEffect, useState } from "react";
import type { CmssyLayoutGroup } from "@cmssy/core";
import type { BlockDefinition } from "../registry";
import type { EditBridgeConfig } from "../bridge/use-edit-bridge";
import { CmssyEditableLayout } from "./cmssy-editable-layout";
import type { LayoutBlockPage } from "./resolve-block-data";

export interface CmssyLazyLayoutProps {
  groups: CmssyLayoutGroup[];
  position: string;
  page?: LayoutBlockPage;
  locale?: string;
  defaultLocale?: string;
  enabledLocales?: string[];
  edit: EditBridgeConfig;
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
  appContext?: Record<string, unknown>;
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

  const resolvedCount = props.resolvedContent
    ? Object.keys(props.resolvedContent).length
    : 0;

  return (
    <>
      <div
        data-cmssy-layout-slot={props.position}
        data-cmssy-editor-content={resolvedCount}
        hidden
      />
      {blocks ? <CmssyEditableLayout {...props} blocks={blocks} /> : null}
    </>
  );
}
