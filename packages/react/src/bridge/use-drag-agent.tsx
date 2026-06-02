import { useEffect, useState } from "react";
import { PROTOCOL_VERSION } from "./protocol";
import { parseEditorMessage, postToEditor } from "./messages";

export interface DragAgentConfig {
  editorOrigin: string;
}

const MOVE_MIME = "application/x-cmssy-move";

interface DropTarget {
  index: number;
  y: number;
}

function blockElements(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-block-id]"),
  ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
}

function computeDropTarget(clientY: number): DropTarget {
  const els = blockElements();
  for (let i = 0; i < els.length; i++) {
    const r = els[i]!.getBoundingClientRect();
    if (clientY < r.top + r.height / 2) {
      return { index: i, y: r.top };
    }
  }
  const last = els[els.length - 1];
  return {
    index: els.length,
    y: last ? last.getBoundingClientRect().bottom : 0,
  };
}

export function useDragAgent(config: DragAgentConfig): {
  dropY: number | null;
} {
  const [dropY, setDropY] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const { editorOrigin } = config;
    if (editorOrigin === "*" && typeof console !== "undefined") {
      console.warn(
        "[cmssy] editorOrigin '*' disables origin checks - dev only, do not use in production",
      );
    }
    let movingId: string | null = null;
    let lastDropY: number | null = null;
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
      event.dataTransfer.setData(MOVE_MIME, id);
      event.dataTransfer.effectAllowed = "move";
    };

    const onDragOver = (event: DragEvent) => {
      if (!movingId) return;
      event.preventDefault();
      updateDropY(computeDropTarget(event.clientY).y);
    };

    const onDrop = (event: DragEvent) => {
      if (!movingId) return;
      event.preventDefault();
      const { index } = computeDropTarget(event.clientY);
      const blockId = movingId;
      movingId = null;
      updateDropY(null);
      try {
        postToEditor(window.parent, editorOrigin, {
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
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source && event.source !== window.parent) return;
      const message = parseEditorMessage(
        event.data,
        event.origin,
        editorOrigin,
      );
      if (!message) return;
      if (message.type === "cmssy:drag-over") {
        const { index, y } = computeDropTarget(message.y);
        updateDropY(y);
        try {
          postToEditor(window.parent, editorOrigin, {
            type: "cmssy:drag-index",
            protocolVersion: PROTOCOL_VERSION,
            index,
          });
        } catch {
          // ignore
        }
      } else if (message.type === "cmssy:drag-end") {
        updateDropY(null);
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
