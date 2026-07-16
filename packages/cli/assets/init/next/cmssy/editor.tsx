"use client";

import { CmssyLazyEditor } from "@cmssy/react/client";
import type { CmssyEditorProps } from "@cmssy/next";

// The block registry is loaded lazily ON THE CLIENT, so block loaders - which
// run server-side and read the config - never reach the browser bundle.
export function CmssyEditor(props: CmssyEditorProps) {
  return <CmssyLazyEditor {...props} load={() => import("./blocks")} />;
}
