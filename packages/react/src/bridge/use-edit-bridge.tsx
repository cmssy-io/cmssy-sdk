import { useEffect, useState } from "react";
import { getBlockSchemas } from "../registry";
import { PROTOCOL_VERSION, type BlockRect } from "./protocol";
import { parseEditorMessage, postToEditor } from "./messages";

export interface EditBridgeConfig {
  editorOrigin: string;
}

export type PatchMap = Partial<Record<string, Record<string, unknown>>>;

export interface EditBridgeState {
  patches: PatchMap;
  selected: string | null;
}

interface BridgePage {
  id: string;
  blocks: ReadonlyArray<{ id: string; type: string }>;
}

const ZERO_RECT: BlockRect = { x: 0, y: 0, width: 0, height: 0 };

function collectRects(): Map<string, BlockRect> {
  const rects = new Map<string, BlockRect>();
  if (typeof document === "undefined") return rects;
  for (const el of document.querySelectorAll("[data-block-id]")) {
    const id = el.getAttribute("data-block-id");
    if (id && !rects.has(id)) {
      const r = el.getBoundingClientRect();
      rects.set(id, { x: r.x, y: r.y, width: r.width, height: r.height });
    }
  }
  return rects;
}

export function useEditBridge(
  page: BridgePage,
  config: EditBridgeConfig,
): EditBridgeState {
  const [patches, setPatches] = useState<PatchMap>({});
  const [selected, setSelected] = useState<string | null>(null);

  const { id: pageId, blocks } = page;
  const blocksKey = blocks.map((b) => `${b.id}:${b.type}`).join("|");

  useEffect(() => {
    setPatches({});
    setSelected(null);
  }, [pageId, blocksKey]);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const { editorOrigin } = config;
    if (editorOrigin === "*" && typeof console !== "undefined") {
      console.warn(
        "[cmssy] editorOrigin '*' disables origin checks - dev only, do not use in production",
      );
    }
    const knownIds = new Set(blocks.map((b) => b.id));

    const sendReady = () => {
      try {
        const rects = collectRects();
        postToEditor(window.parent, editorOrigin, {
          type: "cmssy:ready",
          protocolVersion: PROTOCOL_VERSION,
          blocks: blocks.map((b) => ({
            id: b.id,
            type: b.type,
            bounds: rects.get(b.id) ?? ZERO_RECT,
          })),
          schemas: getBlockSchemas(),
        });
      } catch (error) {
        if (typeof console !== "undefined") {
          console.warn("[cmssy] failed to post to editor", error);
        }
      }
    };

    const handler = (event: MessageEvent) => {
      if (event.source && event.source !== window.parent) return;
      const message = parseEditorMessage(
        event.data,
        event.origin,
        editorOrigin,
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
  }, [config.editorOrigin, pageId, blocksKey]);

  return { patches, selected };
}
