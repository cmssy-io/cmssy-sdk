"use client";
import { CmssyLazyEditor } from "@cmssy/react/client";

// The edit bridge is a client island: the editor talks to the page over
// postMessage, and that protocol lives in @cmssy/core - not in React and not in
// Next. That is why the same bridge works here.
export default function CmssyEditor(props: Record<string, unknown>) {
  return <CmssyLazyEditor {...(props as never)} load={() => import("./blocks")} />;
}
