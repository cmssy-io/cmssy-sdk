import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CMSSY_EDITOR_ORIGINS, resolveEditorOrigin } from "../config";

describe("resolveEditorOrigin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to both cmssy.io and www.cmssy.io in production when unset", () => {
    vi.stubEnv("CMSSY_EDITOR_ORIGIN", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveEditorOrigin(undefined)).toEqual(
      DEFAULT_CMSSY_EDITOR_ORIGINS,
    );
  });

  it("defaults to '*' in development when unset (any admin origin)", () => {
    vi.stubEnv("CMSSY_EDITOR_ORIGIN", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveEditorOrigin(undefined)).toBe("*");
  });

  it("returns the default for an empty string", () => {
    vi.stubEnv("CMSSY_EDITOR_ORIGIN", "");
    expect(resolveEditorOrigin("")).toEqual(DEFAULT_CMSSY_EDITOR_ORIGINS);
  });

  it("returns the default for an empty array", () => {
    expect(resolveEditorOrigin([])).toEqual(DEFAULT_CMSSY_EDITOR_ORIGINS);
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

  it("reads a single origin from CMSSY_EDITOR_ORIGIN", () => {
    vi.stubEnv("CMSSY_EDITOR_ORIGIN", "http://localhost:3000");
    expect(resolveEditorOrigin(undefined)).toBe("http://localhost:3000");
  });

  it("reads a comma-separated list from CMSSY_EDITOR_ORIGIN", () => {
    vi.stubEnv(
      "CMSSY_EDITOR_ORIGIN",
      "http://localhost:3000, https://cmssy.io",
    );
    expect(resolveEditorOrigin(undefined)).toEqual([
      "http://localhost:3000",
      "https://cmssy.io",
    ]);
  });

  it("prefers an explicit value over env", () => {
    vi.stubEnv("CMSSY_EDITOR_ORIGIN", "http://env:3000");
    expect(resolveEditorOrigin("https://explicit.com")).toBe(
      "https://explicit.com",
    );
  });
});
