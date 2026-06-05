"use client";

import { useEffect, useState } from "react";
import type { CmssyPageData } from "../content/content-client";
import type { BlockDefinition } from "../registry";
import type { EditBridgeConfig } from "../bridge/use-edit-bridge";
import { CmssyEditablePage } from "./editable-page";

export interface CmssyLazyEditorProps {
  page: CmssyPageData | null;
  locale?: string;
  defaultLocale?: string;
  edit: EditBridgeConfig;
  load: () => Promise<{ blocks: BlockDefinition[]; category?: string }>;
}

export function CmssyLazyEditor({ load, ...props }: CmssyLazyEditorProps) {
  const [loaded, setLoaded] = useState<{
    blocks: BlockDefinition[];
    category?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    load().then((m) => {
      if (active) setLoaded({ blocks: m.blocks, category: m.category });
    });
    return () => {
      active = false;
    };
  }, [load]);

  if (!loaded) return null;
  return (
    <CmssyEditablePage
      {...props}
      blocks={loaded.blocks}
      category={loaded.category}
    />
  );
}
