import {
  PROTOCOL_VERSION,
  type AppToEditorMessage,
  type EditorToAppMessage,
} from "./protocol";

export interface PostTarget {
  postMessage: (message: unknown, targetOrigin: string) => void;
}

export function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();
  if (trimmed === "*") return "*";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

export function postToEditor(
  target: PostTarget,
  editorOrigin: string,
  message: AppToEditorMessage,
): void {
  target.postMessage(message, normalizeOrigin(editorOrigin));
}

export function isOriginAllowed(
  origin: string,
  allowed: string | string[],
): boolean {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  const actual = normalizeOrigin(origin);
  return list.some((candidate) => {
    const expected = normalizeOrigin(candidate);
    return expected === "*" || expected === actual;
  });
}

export function resolveInitialTarget(editorOrigin: string | string[]): string {
  const list = (
    Array.isArray(editorOrigin) ? editorOrigin : [editorOrigin]
  ).map((origin) => normalizeOrigin(origin));
  if (list.includes("*")) return "*";
  if (list.length === 1) return list[0]!;
  const referrerOrigin =
    typeof document !== "undefined" && document.referrer
      ? normalizeOrigin(document.referrer)
      : "";
  return list.find((origin) => origin === referrerOrigin) ?? list[0]!;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseEditorMessage(
  data: unknown,
  origin: string,
  expectedOrigin: string | string[],
): EditorToAppMessage | null {
  if (!isOriginAllowed(origin, expectedOrigin)) return null;
  if (!isObject(data)) return null;

  switch (data.type) {
    case "cmssy:select":
      return typeof data.blockId === "string" &&
        data.protocolVersion === PROTOCOL_VERSION
        ? {
            type: "cmssy:select",
            protocolVersion: PROTOCOL_VERSION,
            blockId: data.blockId,
          }
        : null;
    case "cmssy:patch":
      return typeof data.blockId === "string" &&
        isObject(data.content) &&
        data.protocolVersion === PROTOCOL_VERSION
        ? {
            type: "cmssy:patch",
            blockId: data.blockId,
            content: data.content,
            protocolVersion: PROTOCOL_VERSION,
            ...(isObject(data.style) ? { style: data.style } : {}),
            ...(isObject(data.advanced) ? { advanced: data.advanced } : {}),
            ...(typeof data.layoutPosition === "string"
              ? { layoutPosition: data.layoutPosition }
              : {}),
          }
        : null;
    case "cmssy:parent-ready":
      return data.protocolVersion === PROTOCOL_VERSION
        ? { type: "cmssy:parent-ready", protocolVersion: PROTOCOL_VERSION }
        : null;
    case "cmssy:insert":
      return typeof data.blockId === "string" &&
        typeof data.blockType === "string" &&
        isObject(data.content) &&
        typeof data.index === "number" &&
        data.protocolVersion === PROTOCOL_VERSION
        ? {
            type: "cmssy:insert",
            protocolVersion: PROTOCOL_VERSION,
            blockId: data.blockId,
            blockType: data.blockType,
            content: data.content,
            ...(isObject(data.style) ? { style: data.style } : {}),
            ...(isObject(data.advanced) ? { advanced: data.advanced } : {}),
            index: data.index,
          }
        : null;
    case "cmssy:reorder":
      return Array.isArray(data.blockIds) &&
        data.blockIds.every((id) => typeof id === "string") &&
        data.protocolVersion === PROTOCOL_VERSION
        ? {
            type: "cmssy:reorder",
            protocolVersion: PROTOCOL_VERSION,
            blockIds: data.blockIds as string[],
          }
        : null;
    case "cmssy:remove":
      return typeof data.blockId === "string" &&
        data.protocolVersion === PROTOCOL_VERSION
        ? {
            type: "cmssy:remove",
            protocolVersion: PROTOCOL_VERSION,
            blockId: data.blockId,
          }
        : null;
    case "cmssy:drag-over":
      return typeof data.y === "number" &&
        data.protocolVersion === PROTOCOL_VERSION
        ? {
            type: "cmssy:drag-over",
            protocolVersion: PROTOCOL_VERSION,
            y: data.y,
          }
        : null;
    case "cmssy:drag-end":
      return data.protocolVersion === PROTOCOL_VERSION
        ? { type: "cmssy:drag-end", protocolVersion: PROTOCOL_VERSION }
        : null;
    default:
      return null;
  }
}
