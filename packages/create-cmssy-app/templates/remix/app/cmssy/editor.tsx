import { CmssyLazyEditor } from "@cmssy/react/client";
import type { CmssyPageData } from "@cmssy/core";

// The edit bridge: the editor talks to the page over postMessage, and that
// protocol lives in @cmssy/core - not in React and not in a framework.
export function CmssyEditor(props: {
  page: CmssyPageData | null;
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  edit: { editorOrigin: string | string[] };
}) {
  return <CmssyLazyEditor {...props} load={() => import("./blocks")} />;
}
