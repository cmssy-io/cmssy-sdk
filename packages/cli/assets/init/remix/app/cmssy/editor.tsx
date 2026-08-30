import { CmssyLazyEditor, type EditBridgeConfig } from "@cmssy/react/client";
import type { CmssyPageData } from "@cmssy/core";

export function CmssyEditor(props: {
  page: CmssyPageData | null;
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  edit: EditBridgeConfig;
}) {
  return <CmssyLazyEditor {...props} load={() => import("./blocks")} />;
}
