import { describe, expect, it } from "vitest";
import type { ShortcutAction } from "@cmssy/core";
import { resolveShortcutAction } from "../bridge/shortcut-keys";

/**
 * The twin of this table lives in the admin, at
 * cmssy/apps/frontend/src/hooks/useKeyboardShortcuts.ts (`resolveAction`),
 * because a keystroke outside the preview iframe never reaches this module.
 *
 * The two must agree. Nothing structural makes them - the admin depends on
 * @cmssy/types, not on this package - so this file is the agreement written
 * down, and the same cases are asserted on the admin side.
 *
 * CMS-1199 shipped with the two out of step: this side ignored `repeat` and
 * IME composition, so holding Cmd+Z flooded undo in the editor and moved one
 * step in the preview. Nothing failed. That is what this table is for.
 */

interface Case {
  name: string;
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  repeat?: boolean;
  composing?: boolean;
  mac?: boolean;
  typing?: boolean;
  expected: ShortcutAction | null;
}

const CASES: Case[] = [
  { name: "Cmd+Z undoes on mac", key: "z", meta: true, expected: "undo" },
  {
    name: "Ctrl+Z undoes off mac",
    key: "z",
    ctrl: true,
    mac: false,
    expected: "undo",
  },
  {
    name: "Cmd+Shift+Z redoes",
    key: "z",
    meta: true,
    shift: true,
    expected: "redo",
  },
  { name: "Cmd+S saves", key: "s", meta: true, expected: "save" },
  {
    name: "Cmd+S saves even while typing",
    key: "s",
    meta: true,
    typing: true,
    expected: "save",
  },
  { name: "Cmd+D duplicates", key: "d", meta: true, expected: "duplicate" },
  { name: "Delete deletes", key: "Delete", expected: "delete" },
  {
    name: "Backspace deletes on mac only",
    key: "Backspace",
    expected: "delete",
  },
  {
    name: "Backspace does nothing off mac",
    key: "Backspace",
    mac: false,
    expected: null,
  },
  {
    name: "Ctrl+S saves off mac",
    key: "s",
    ctrl: true,
    mac: false,
    expected: "save",
  },
  {
    name: "Ctrl+D duplicates off mac",
    key: "d",
    ctrl: true,
    mac: false,
    expected: "duplicate",
  },
  {
    name: "Ctrl+Shift+Z redoes off mac",
    key: "z",
    ctrl: true,
    shift: true,
    mac: false,
    expected: "redo",
  },
  {
    name: "Cmd is not the modifier off mac",
    key: "z",
    meta: true,
    mac: false,
    expected: null,
  },
  {
    name: "Ctrl is not the modifier on mac",
    key: "s",
    ctrl: true,
    expected: null,
  },
  {
    name: "Delete deletes off mac",
    key: "Delete",
    mac: false,
    expected: "delete",
  },
  { name: "Escape escapes", key: "Escape", expected: "escape" },
  {
    name: "Escape escapes while typing",
    key: "Escape",
    typing: true,
    expected: "escape",
  },
  {
    name: "undo is suppressed while typing",
    key: "z",
    meta: true,
    typing: true,
    expected: null,
  },
  {
    name: "duplicate is suppressed while typing",
    key: "d",
    meta: true,
    typing: true,
    expected: null,
  },
  {
    name: "delete is suppressed while typing",
    key: "Delete",
    typing: true,
    expected: null,
  },
  {
    name: "a held key repeats nothing",
    key: "z",
    meta: true,
    repeat: true,
    expected: null,
  },
  {
    name: "an IME composition resolves to nothing",
    key: "z",
    meta: true,
    composing: true,
    expected: null,
  },
  { name: "an unmodified letter is not a shortcut", key: "z", expected: null },
  {
    name: "a modifier alone is not a shortcut",
    key: "Meta",
    meta: true,
    expected: null,
  },
];

describe("shortcut vocabulary (CMS-1205)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const action = resolveShortcutAction(
        {
          key: c.key,
          metaKey: c.meta ?? false,
          ctrlKey: c.ctrl ?? false,
          shiftKey: c.shift ?? false,
          repeat: c.repeat ?? false,
          isComposing: c.composing ?? false,
        },
        c.mac ?? true,
        c.typing ?? false,
      );
      expect(action).toBe(c.expected);
    });
  }

  it("resolves nothing outside the six actions it claims", () => {
    const actions = new Set(
      CASES.map((c) => c.expected).filter(
        (a): a is ShortcutAction => a !== null,
      ),
    );
    expect([...actions].sort()).toEqual([
      "delete",
      "duplicate",
      "escape",
      "redo",
      "save",
      "undo",
    ]);
  });
});
