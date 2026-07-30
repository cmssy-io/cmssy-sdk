"use client";
import { CmssyLazyEditor } from "@cmssy/react/client";

export default function CmssyEditor(props: Record<string, unknown>) {
  return <CmssyLazyEditor {...(props as never)} load={() => import("./blocks")} />;
}
