import { useCallback, useEffect, useState } from "react";
import { getBlockSchemas } from "../registry";
import { PROTOCOL_VERSION, type BlockRect } from "./protocol";
import { parseEditorMessage, postToEditor } from "./messages";

export interface EditBridgeConfig {
  editorOrigin: string;
}

export interface EditBridgeState {
  patches: Record<string, Record<string, unknown>>;
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
  const [patches, setPatches] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [selected, setSelected] = useState<string | null>(null);

  const sendReady = useCallback(() => {
    if (typeof window === "undefined") return;
    postToEditor(window.parent, config.editorOrigin, {
      type: "cmssy:ready",
      protocolVersion: PROTOCOL_VERSION,
      blocks: blocks.map((b) => ({
        id: b.id,
        type: b.type,
        bounds: rectOf(b.id),
      })),
      schemas: getBlockSchemas(),
    });
  }, [blocks, config.editorOrigin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: MessageEvent) => {
      const message = parseEditorMessage(
        event.data,
        event.origin,
        config.editorOrigin,
      );
      if (!message) return;
      if (message.type === "cmssy:patch") {
        setPatches((prev) => ({ ...prev, [message.blockId]: message.content }));
      } else if (message.type === "cmssy:select") {
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
