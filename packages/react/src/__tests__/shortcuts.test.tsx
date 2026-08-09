// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PROTOCOL_VERSION, fields, type ShortcutAction } from "@cmssy/core";
import { CmssyEditablePage } from "../components/editable-page";
import { defineBlock, type BlockProps } from "../registry";
import {
  isTypingTarget,
  resolveShortcutAction,
  type ShortcutKeyEvent,
} from "../bridge/shortcut-keys";

const editorOrigin = "https://editor.cmssy.io";

const heroProps = { heading: fields.text() };
const Hero = ({ content }: BlockProps<typeof heroProps>) => (
  <h1>{content.heading ?? ""}</h1>
);
const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: heroProps,
});
const blocks = [heroBlock];
const page = {
  id: "p",
  blocks: [{ id: "b1", type: "hero", content: { en: { heading: "Hello" } } }],
};

function keyEvent(overrides: Partial<ShortcutKeyEvent>): ShortcutKeyEvent {
  return {
    key: "a",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    ...overrides,
  };
}

describe("resolveShortcutAction", () => {
  it("resolves every allowlisted keystroke on macOS", () => {
    const cases: Array<[Partial<ShortcutKeyEvent>, ShortcutAction]> = [
      [{ key: "z", metaKey: true }, "undo"],
      [{ key: "Z", metaKey: true, shiftKey: true }, "redo"],
      [{ key: "s", metaKey: true }, "save"],
      [{ key: "d", metaKey: true }, "duplicate"],
      [{ key: "Delete" }, "delete"],
      [{ key: "Backspace" }, "delete"],
      [{ key: "Escape" }, "escape"],
    ];
    for (const [event, action] of cases) {
      expect(resolveShortcutAction(keyEvent(event), true, false)).toBe(action);
    }
  });

  it("uses ctrl rather than meta off macOS, and leaves Backspace alone there", () => {
    expect(
      resolveShortcutAction(
        keyEvent({ key: "z", ctrlKey: true }),
        false,
        false,
      ),
    ).toBe("undo");
    expect(
      resolveShortcutAction(
        keyEvent({ key: "z", metaKey: true }),
        false,
        false,
      ),
    ).toBeNull();
    expect(
      resolveShortcutAction(keyEvent({ key: "Backspace" }), false, false),
    ).toBeNull();
    expect(
      resolveShortcutAction(keyEvent({ key: "Delete" }), false, false),
    ).toBe("delete");
  });

  it("returns null for anything outside the allowlist", () => {
    const outside: Array<Partial<ShortcutKeyEvent>> = [
      { key: "a" },
      { key: "z" },
      { key: "F5" },
      { key: "Tab" },
      { key: "Enter" },
      { key: "k", metaKey: true },
      { key: "ArrowDown" },
    ];
    for (const event of outside) {
      expect(resolveShortcutAction(keyEvent(event), true, false)).toBeNull();
    }
  });

  it("ignores key repeat", () => {
    expect(
      resolveShortcutAction(
        keyEvent({ key: "z", metaKey: true, repeat: true }),
        true,
        false,
      ),
    ).toBeNull();
  });

  it("ignores keystrokes during IME composition", () => {
    expect(
      resolveShortcutAction(
        keyEvent({ key: "Escape", isComposing: true }),
        true,
        false,
      ),
    ).toBeNull();
  });

  it("suppresses undo, redo, duplicate and delete while typing", () => {
    const suppressed: Array<Partial<ShortcutKeyEvent>> = [
      { key: "z", metaKey: true },
      { key: "Z", metaKey: true, shiftKey: true },
      { key: "d", metaKey: true },
      { key: "Delete" },
      { key: "Backspace" },
    ];
    for (const event of suppressed) {
      expect(resolveShortcutAction(keyEvent(event), true, true)).toBeNull();
    }
  });

  it("forwards save and escape while typing", () => {
    expect(
      resolveShortcutAction(keyEvent({ key: "s", metaKey: true }), true, true),
    ).toBe("save");
    expect(resolveShortcutAction(keyEvent({ key: "Escape" }), true, true)).toBe(
      "escape",
    );
  });
});

describe("isTypingTarget", () => {
  it("recognises inputs, textareas and contenteditable hosts", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
  });

  it("does not treat a plain element or a missing target as typing", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

let mockParent: { postMessage: ReturnType<typeof vi.fn> };

function setParent(value: unknown) {
  Object.defineProperty(window, "parent", {
    value,
    configurable: true,
    writable: true,
  });
}

function shortcutPosts() {
  return mockParent.postMessage.mock.calls
    .map((c) => c[0] as { type?: string; action?: string })
    .filter((m) => m?.type === "cmssy:shortcut");
}

function readyMessage() {
  return mockParent.postMessage.mock.calls.find(
    (c) => (c[0] as { type?: string })?.type === "cmssy:ready",
  )?.[0] as { capabilities?: string[] };
}

function pressKey(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.body.dispatchEvent(event);
  return event;
}

describe("shortcut forwarding over the bridge", () => {
  beforeEach(() => {
    cleanup();
    mockParent = { postMessage: vi.fn() };
    setParent(mockParent);
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });
  });

  afterEach(() => {
    setParent(window);
  });

  function renderPage() {
    return render(
      <CmssyEditablePage
        page={page}
        locale="en"
        edit={{ editorOrigin }}
        blocks={blocks}
      />,
    );
  }

  it("declares the shortcuts capability in cmssy:ready", () => {
    renderPage();
    expect(readyMessage().capabilities).toContain("shortcuts");
  });

  it("posts the action and swallows the keystroke", () => {
    renderPage();
    const event = pressKey({ key: "z", metaKey: true });
    expect(shortcutPosts()).toEqual([
      {
        type: "cmssy:shortcut",
        protocolVersion: PROTOCOL_VERSION,
        action: "undo",
      },
    ]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves a non-allowlisted keystroke entirely to the page", () => {
    renderPage();
    const event = pressKey({ key: "k", metaKey: true });
    expect(shortcutPosts()).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not forward a suppressed shortcut from inside an input", () => {
    const { container } = renderPage();
    const input = document.createElement("input");
    container.appendChild(input);
    const event = new KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    expect(shortcutPosts()).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("still forwards save from inside an input", () => {
    const { container } = renderPage();
    const input = document.createElement("input");
    container.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "s",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(shortcutPosts().map((m) => m.action)).toEqual(["save"]);
  });

  it("stops forwarding once unmounted", () => {
    const { unmount } = renderPage();
    unmount();
    mockParent.postMessage.mockClear();
    pressKey({ key: "Escape" });
    expect(shortcutPosts()).toEqual([]);
  });
});
