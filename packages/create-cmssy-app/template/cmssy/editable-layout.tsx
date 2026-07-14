"use client";

import {
  CmssyLazyLayout,
  type CmssyLazyLayoutProps,
} from "@cmssy/react/client";

// Mounts the layout blocks through the edit bridge, so the header and the footer
// are editable in the editor rather than markup it can select and cannot fill.
export function EditableLayout(props: Omit<CmssyLazyLayoutProps, "load">) {
  return <CmssyLazyLayout {...props} load={() => import("./blocks")} />;
}
