"use client";

import {
  CmssyLazyLayout,
  type CmssyLazyLayoutProps,
} from "@cmssy/react/client";

export function EditableLayout(props: Omit<CmssyLazyLayoutProps, "load">) {
  return <CmssyLazyLayout {...props} load={() => import("./blocks")} />;
}
