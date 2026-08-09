import type { ShortcutAction } from "@cmssy/core";

export interface ShortcutKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
}

export function isMacPlatform(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0
  );
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true
  );
}

export function resolveShortcutAction(
  event: ShortcutKeyEvent,
  isMac: boolean,
  isTyping: boolean,
): ShortcutAction | null {
  if (event.repeat || event.isComposing) return null;

  const modifier = isMac ? event.metaKey : event.ctrlKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (modifier && key === "z") {
    if (isTyping) return null;
    return event.shiftKey ? "redo" : "undo";
  }

  if (modifier && key === "s") return "save";

  if (modifier && key === "d") return isTyping ? null : "duplicate";

  const isDeleteKey = key === "Delete" || (isMac && key === "Backspace");
  if (isDeleteKey) return isTyping ? null : "delete";

  if (key === "Escape") return "escape";

  return null;
}
