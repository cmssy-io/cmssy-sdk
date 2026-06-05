import { useEffect, useRef, useState } from "react";
import {
  PROTOCOL_VERSION,
  type BlockMeta,
  type BlockRect,
  type BlockSchema,
} from "./protocol";
import { parseEditorMessage, postToEditor } from "./messages";

export interface EditBridgeConfig {
  editorOrigin: string;
  schemas?: Record<string, BlockSchema>;
  blockMeta?: Record<string, BlockMeta>;
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
  removed: string[];
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

interface ReadyBlock {
  id: string;
  type: string;
  bounds: BlockRect;
  layoutPosition?: string;
}

function collectLayoutBlocks(
  rects: Map<string, BlockRect>,
  pageIds: Set<string>,
): ReadyBlock[] {
  const out: ReadyBlock[] = [];
  if (typeof document === "undefined") return out;
  const seen = new Set<string>();
  for (const el of document.querySelectorAll("[data-layout-position]")) {
    const id = el.getAttribute("data-block-id");
    const type = el.getAttribute("data-block-type");
    const layoutPosition = el.getAttribute("data-layout-position");
    if (
      id &&
      type &&
      layoutPosition !== null &&
      !pageIds.has(id) &&
      !seen.has(id)
    ) {
      seen.add(id);
      out.push({
        id,
        type,
        layoutPosition,
        bounds: rects.get(id) ?? ZERO_RECT,
      });
    }
  }
  return out;
}

export function useEditBridge(
  page: BridgePage,
  config: EditBridgeConfig,
): EditBridgeState {
  const [patches, setPatches] = useState<PatchMap>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [inserted, setInserted] = useState<InsertedBlock[]>([]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const selectedIdRef = useRef<string | null>(null);

  const { id: pageId, blocks } = page;
  const blocksKey = blocks.map((b) => `${b.id}:${b.type}`).join("|");

  useEffect(() => {
    setPatches({});
    setSelected(null);
    setInserted([]);
    setOrder(null);
    setRemoved([]);
    selectedIdRef.current = null;
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
        const pageIds = new Set(blocks.map((b) => b.id));
        postToEditor(window.parent, editorOrigin, {
          type: "cmssy:ready",
          protocolVersion: PROTOCOL_VERSION,
          blocks: [
            ...blocks.map((b) => ({
              id: b.id,
              type: b.type,
              bounds: rects.get(b.id) ?? ZERO_RECT,
            })),
            ...collectLayoutBlocks(rects, pageIds),
          ],
          schemas:
            config.schemas ??
            (Object.create(null) as Record<string, BlockSchema>),
          blockMeta:
            config.blockMeta ??
            (Object.create(null) as Record<string, BlockMeta>),
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
        if (message.layoutPosition !== undefined) return;
        setPatches((prev) => ({
          ...prev,
          [message.blockId]: { ...prev[message.blockId], ...message.content },
        }));
      } else if (message.type === "cmssy:select") {
        setSelected(message.blockId);
        selectedIdRef.current = message.blockId;
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
      } else if (message.type === "cmssy:remove") {
        setRemoved((prev) =>
          prev.includes(message.blockId) ? prev : [...prev, message.blockId],
        );
      } else if (message.type === "cmssy:parent-ready") {
        sendReady();
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const el = target?.closest?.("[data-block-id]") as HTMLElement | null;
      const id = el?.getAttribute("data-block-id");
      if (!id || !el) return;
      selectedIdRef.current = id;
      if (target?.closest?.("a[href]")) event.preventDefault();
      const r = el.getBoundingClientRect();
      const layoutPosition = el.getAttribute("data-layout-position");
      try {
        postToEditor(window.parent, editorOrigin, {
          type: "cmssy:click",
          blockId: id,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          ...(layoutPosition !== null ? { layoutPosition } : {}),
        });
      } catch {
        // editor frame may reject during teardown; ignore
      }
    };

    let boundsRaf = 0;
    const emitSelectedBounds = () => {
      if (boundsRaf) return;
      boundsRaf = requestAnimationFrame(() => {
        boundsRaf = 0;
        const id = selectedIdRef.current;
        if (!id) return;
        const el = document.querySelector(
          `[data-block-id="${id.replace(/["\\]/g, "\\$&")}"]`,
        );
        if (!el) return;
        const r = el.getBoundingClientRect();
        try {
          postToEditor(window.parent, editorOrigin, {
            type: "cmssy:bounds",
            blockId: id,
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          });
        } catch {
          // editor frame may reject during teardown; ignore
        }
      });
    };

    window.addEventListener("message", handler);
    document.addEventListener("click", onClick);
    window.addEventListener("scroll", emitSelectedBounds, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", emitSelectedBounds);
    sendReady();
    return () => {
      if (boundsRaf) cancelAnimationFrame(boundsRaf);
      window.removeEventListener("message", handler);
      document.removeEventListener("click", onClick);
      window.removeEventListener("scroll", emitSelectedBounds, {
        capture: true,
      });
      window.removeEventListener("resize", emitSelectedBounds);
    };
  }, [config.editorOrigin, pageId, blocksKey]);

  return { patches, selected, inserted, order, removed };
}
