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
  resolvedContent?: Record<string, Record<string, unknown>>;
  /** Forwarded untouched to the block context as `context.app`. */
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

  // The blocks arrive on the client, so nothing below this component is in the
  // server HTML - which left no way to tell a mounted slot from a missing one
  // until the browser ran. This marker is server-rendered, hidden, and is what
  // `checkCmssyEditMode` reads to prove the header is editable at all.
  return (
    <>
      <div data-cmssy-layout-slot={props.position} hidden />
      {blocks ? <CmssyEditableLayout {...props} blocks={blocks} /> : null}
    </>
  );
}
