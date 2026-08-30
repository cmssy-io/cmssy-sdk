import { useEffect, useState } from "react";
import type { EditBridgeConfig, PatchMap } from "./use-edit-bridge";
import { parseEditorMessage } from "@cmssy/core";

export function useLayoutPatchBridge(
  region: string,
  config: EditBridgeConfig,
): PatchMap {
  const [patches, setPatches] = useState<PatchMap>({});

  useEffect(() => {
    setPatches({});
    if (typeof window === "undefined" || window.parent === window) return;
    const { editorOrigin } = config;
    const handler = (event: MessageEvent) => {
      if (event.source && event.source !== window.parent) return;
      const message = parseEditorMessage(
        event.data,
        event.origin,
        editorOrigin,
      );
      if (!message) return;
      if (
        message.type === "cmssy:patch" &&
        message.layoutRegion === region
      ) {
        setPatches((prev) => ({
          ...prev,
          [message.blockId]: { ...prev[message.blockId], ...message.content },
        }));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [config.editorOrigin, region]);

  return patches;
}
