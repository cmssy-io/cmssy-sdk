import { useEffect, useState } from "react";
import { PROTOCOL_VERSION } from "./protocol";
import {
  parseEditorMessage,
  postToEditor,
  resolveInitialTarget,
} from "./messages";

export interface DragAgentConfig {
  editorOrigin: string | string[];
}

const MOVE_MIME = "application/x-cmssy-move";

interface DropTarget {
  index: number;
  y: number;
}

function visible(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

function blockElements(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-block-id]:not([data-layout-position])",
    ),
  ).filter(visible);
}

interface CachedBlock {
  index: number;
  absTop: number;
  absMid: number;
}

interface DropTargetResolver {
  resolve(clientY: number): DropTarget;
  invalidate(): void;
}

function createDropTargetResolver(): DropTargetResolver {
  let cache: { blocks: CachedBlock[]; absLastBottom: number } | null = null;

  const build = () => {
    const els = blockElements();
    const scrollY = window.scrollY;
    let absLastBottom = scrollY;
    const blocks = els.map((el, index) => {
      const r = el.getBoundingClientRect();
      absLastBottom = r.bottom + scrollY;
      return {
        index,
        absTop: r.top + scrollY,
        absMid: r.top + scrollY + r.height / 2,
      };
    });
    cache = { blocks, absLastBottom };
  };

  return {
    resolve(clientY) {
      if (!cache) build();
      const scrollY = window.scrollY;
      const pageY = clientY + scrollY;
      for (const block of cache!.blocks) {
        if (pageY < block.absMid) {
          return { index: block.index, y: block.absTop - scrollY };
        }
      }
      return {
        index: cache!.blocks.length,
        y: cache!.absLastBottom - scrollY,
      };
    },
    invalidate() {
      cache = null;
    },
  };
}

export function useDragAgent(config: DragAgentConfig): {
  dropY: number | null;
} {
  const [dropY, setDropY] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const { editorOrigin } = config;
    let postTarget = resolveInitialTarget(editorOrigin);
    const isWildcard = Array.isArray(editorOrigin)
      ? editorOrigin.includes("*")
      : editorOrigin === "*";
    if (isWildcard && typeof console !== "undefined") {
      console.warn(
        "[cmssy] editorOrigin '*' disables origin checks - dev only, do not use in production",
      );
    }
    let movingId: string | null = null;
    let lastDropY: number | null = null;
    const resolver = createDropTargetResolver();
    const updateDropY = (y: number | null) => {
      if (y === lastDropY) return;
      lastDropY = y;
      setDropY(y);
    };

    // Reorder is an in-document drag, so the agent sees the native events
    // and posts cmssy:move. Drop-to-add is a drag started in the editor
    // (parent) that never reaches this cross-origin frame, so the editor
    // forwards the cursor via cmssy:drag-over and we report the index back.

    const onDragStart = (event: DragEvent) => {
      const blockEl = (
        event.target as HTMLElement | null
      )?.closest<HTMLElement>("[data-block-id]");
      const id = blockEl?.getAttribute("data-block-id");
      if (!id || !event.dataTransfer) return;
      movingId = id;
      resolver.invalidate();
      event.dataTransfer.setData(MOVE_MIME, id);
      event.dataTransfer.effectAllowed = "move";
    };

    const onDragOver = (event: DragEvent) => {
      if (!movingId) return;
      event.preventDefault();
      updateDropY(resolver.resolve(event.clientY).y);
    };

    const onDrop = (event: DragEvent) => {
      if (!movingId) return;
      event.preventDefault();
      const { index } = resolver.resolve(event.clientY);
      const blockId = movingId;
      movingId = null;
      updateDropY(null);
      resolver.invalidate();
      try {
        postToEditor(window.parent, postTarget, {
          type: "cmssy:move",
          protocolVersion: PROTOCOL_VERSION,
          blockId,
          index,
        });
      } catch {
        // editor frame may reject during teardown; ignore
      }
    };

    const onDragEnd = () => {
      movingId = null;
      updateDropY(null);
      resolver.invalidate();
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source && event.source !== window.parent) return;
      const message = parseEditorMessage(
        event.data,
        event.origin,
        editorOrigin,
      );
      if (!message) return;
      postTarget = event.origin;
      if (message.type === "cmssy:drag-over") {
        const edge = 64;
        const step = 20;
        if (message.y < edge) {
          window.scrollBy(0, -step);
        } else if (message.y > window.innerHeight - edge) {
          window.scrollBy(0, step);
        }
        const { index, y } = resolver.resolve(message.y);
        updateDropY(y);
        try {
          postToEditor(window.parent, postTarget, {
            type: "cmssy:drag-index",
            protocolVersion: PROTOCOL_VERSION,
            index,
          });
        } catch {
          // ignore
        }
      } else if (message.type === "cmssy:drag-end") {
        updateDropY(null);
        resolver.invalidate();
      }
    };

    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragend", onDragEnd);
    window.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("message", onMessage);
    };
  }, [config.editorOrigin]);

  return { dropY };
}
