import { describe, expect, it } from "vitest";
import { DEFAULT_CMSSY_EDITOR_ORIGIN, resolveEditorOrigin } from "../config";

describe("resolveEditorOrigin", () => {
  it("returns the cmssy cloud admin origin when unset", () => {
    expect(resolveEditorOrigin(undefined)).toBe(DEFAULT_CMSSY_EDITOR_ORIGIN);
  });

  it("returns the default for an empty string", () => {
    expect(resolveEditorOrigin("")).toBe(DEFAULT_CMSSY_EDITOR_ORIGIN);
  });

  it("returns the default for an empty array", () => {
    expect(resolveEditorOrigin([])).toBe(DEFAULT_CMSSY_EDITOR_ORIGIN);
  });

  it("keeps an explicit origin (self-host override)", () => {
    expect(resolveEditorOrigin("https://admin.example.com")).toBe(
      "https://admin.example.com",
    );
  });

  it("drops blank entries from an array override", () => {
    expect(resolveEditorOrigin(["https://admin.example.com", "  "])).toEqual([
      "https://admin.example.com",
    ]);
  });
});
