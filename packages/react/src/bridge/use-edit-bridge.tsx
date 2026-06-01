import { useEffect, useState } from "react";
import { getBlockSchemas } from "../registry";
import { PROTOCOL_VERSION, type BlockRect } from "./protocol";
import { parseEditorMessage, postToEditor } from "./messages";

export interface EditBridgeConfig {
  editorOrigin: string;
}

export type PatchMap = Partial<Record<string, Record<string, unknown>>>;

export interface InsertedBlock {
  blockId: string;
  blockType: string;
  content: Record<string, unknown>;
  index: number;
}

export interface EditBridgeState {
  patches: PatchMap;
  selected: string | null;
  inserted: InsertedBlock[];
  order: string[] | null;
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
  const [inserted, setInserted] = useState<InsertedBlock[]>([]);
  const [order, setOrder] = useState<string[] | null>(null);

  const { id: pageId, blocks } = page;
  const blocksKey = blocks.map((b) => `${b.id}:${b.type}`).join("|");

  useEffect(() => {
    setPatches({});
    setSelected(null);
    setInserted([]);
    setOrder(null);
  }, [pageId, blocksKey]);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const { editorOrigin } = config;
    if (editorOrigin === "*" && typeof console !== "undefined") {
      console.warn(
        "[cmssy] editorOrigin '*' disables origin checks - dev only, do not use in production",
      );
    }
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
        setPatches((prev) => ({
          ...prev,
          [message.blockId]: { ...prev[message.blockId], ...message.content },
        }));
      } else if (message.type === "cmssy:select") {
        setSelected(message.blockId);
      } else if (message.type === "cmssy:insert") {
        setInserted((prev) => {
          const next = prev.filter((b) => b.blockId !== message.blockId);
          next.push({
            blockId: message.blockId,
            blockType: message.blockType,
            content: message.content,
            index: message.index,
          });
          return next;
        });
      } else if (message.type === "cmssy:reorder") {
        setOrder(message.blockIds);
      } else if (message.type === "cmssy:parent-ready") {
        sendReady();
      }
    };

    window.addEventListener("message", handler);
    sendReady();
    return () => window.removeEventListener("message", handler);
  }, [config.editorOrigin, pageId, blocksKey]);

  return { patches, selected, inserted, order };
}
