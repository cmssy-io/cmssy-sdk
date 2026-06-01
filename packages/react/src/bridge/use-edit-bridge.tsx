import { useCallback, useEffect, useState } from "react";
import { getBlockSchemas } from "../registry";
import { PROTOCOL_VERSION, type BlockRect } from "./protocol";
import { normalizeOrigin, parseEditorMessage, postToEditor } from "./messages";

export interface EditBridgeConfig {
  editorOrigin: string;
}

export type PatchMap = Partial<Record<string, Record<string, unknown>>>;

export interface EditBridgeState {
  patches: PatchMap;
  selected: string | null;
}

interface BridgeBlock {
  id: string;
  type: string;
}

function rectOf(blockId: string): BlockRect {
  if (typeof document === "undefined") return { x: 0, y: 0, width: 0, height: 0 };
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(blockId)
      : blockId.replace(/["\\]/g, "\\$&");
  const el = document.querySelector(`[data-block-id="${escaped}"]`);
  if (!el) return { x: 0, y: 0, width: 0, height: 0 };
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

export function useEditBridge(
  blocks: BridgeBlock[],
  config: EditBridgeConfig,
): EditBridgeState {
  const [patches, setPatches] = useState<PatchMap>({});
  const [selected, setSelected] = useState<string | null>(null);

  const sendReady = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      postToEditor(window.parent, normalizeOrigin(config.editorOrigin), {
        type: "cmssy:ready",
        protocolVersion: PROTOCOL_VERSION,
        blocks: blocks.map((b) => ({
          id: b.id,
          type: b.type,
          bounds: rectOf(b.id),
        })),
        schemas: getBlockSchemas(),
      });
    } catch (error) {
      if (typeof console !== "undefined") {
        console.warn("[cmssy] failed to post to editor", error);
      }
    }
  }, [blocks, config.editorOrigin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const knownIds = new Set(blocks.map((b) => b.id));
    const handler = (event: MessageEvent) => {
      const message = parseEditorMessage(
        event.data,
        event.origin,
        config.editorOrigin,
      );
      if (!message) return;
      if (message.type === "cmssy:patch") {
        if (!knownIds.has(message.blockId)) return;
        setPatches((prev) => ({
          ...prev,
          [message.blockId]: { ...prev[message.blockId], ...message.content },
        }));
      } else if (message.type === "cmssy:select") {
        if (!knownIds.has(message.blockId)) return;
        setSelected(message.blockId);
      } else if (message.type === "cmssy:parent-ready") {
        sendReady();
      }
    };
    window.addEventListener("message", handler);
    sendReady();
    return () => window.removeEventListener("message", handler);
  }, [config.editorOrigin, sendReady]);

  return { patches, selected };
}
