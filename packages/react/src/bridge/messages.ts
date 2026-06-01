import {
  PROTOCOL_VERSION,
  type AppToEditorMessage,
  type EditorToAppMessage,
} from "./protocol";

export interface PostTarget {
  postMessage: (message: unknown, targetOrigin: string) => void;
}

export function postToEditor(
  target: PostTarget,
  editorOrigin: string,
  message: AppToEditorMessage,
): void {
  target.postMessage(message, editorOrigin);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseEditorMessage(
  data: unknown,
  origin: string,
  expectedOrigin: string,
): EditorToAppMessage | null {
  if (expectedOrigin !== "*" && origin !== expectedOrigin) return null;
  if (!isObject(data)) return null;

  switch (data.type) {
    case "cmssy:select":
      return typeof data.blockId === "string"
        ? { type: "cmssy:select", blockId: data.blockId }
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
          }
        : null;
    case "cmssy:parent-ready":
      return data.protocolVersion === PROTOCOL_VERSION
        ? { type: "cmssy:parent-ready", protocolVersion: PROTOCOL_VERSION }
        : null;
    default:
      return null;
  }
}
