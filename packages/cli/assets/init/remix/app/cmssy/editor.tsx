import { CmssyLazyEditor } from "@cmssy/react/client";
import type { CmssyPageData } from "@cmssy/core";

export function CmssyEditor(props: {
  page: CmssyPageData | null;
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  edit: { editorOrigin: string | string[] };
}) {
  return <CmssyLazyEditor {...props} load={() => import("./blocks")} />;
}
