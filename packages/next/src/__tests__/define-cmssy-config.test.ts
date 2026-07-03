import { describe, expect, it } from "vitest";
import { defineCmssyConfig } from "../config";

describe("defineCmssyConfig", () => {
  it("passes env-shaped values through when required fields are present", () => {
    const config = defineCmssyConfig({
      apiUrl: process.env.CMSSY_API_URL,
      workspaceSlug: "acme",
      draftSecret: "shhh",
      devToken: undefined,
    });
    expect(config.workspaceSlug).toBe("acme");
    expect(config.draftSecret).toBe("shhh");
  });

  it("throws listing missing required env vars", () => {
    expect(() =>
      defineCmssyConfig({ workspaceSlug: undefined, draftSecret: undefined }),
    ).toThrowError(/CMSSY_WORKSPACE_SLUG.*CMSSY_DRAFT_SECRET/s);
  });

  it("treats blank/whitespace values as missing", () => {
    expect(() =>
      defineCmssyConfig({ workspaceSlug: "acme", draftSecret: "   " }),
    ).toThrowError(/CMSSY_DRAFT_SECRET/);
  });

  it("does not require the optional apiUrl", () => {
    expect(() =>
      defineCmssyConfig({ workspaceSlug: "acme", draftSecret: "shhh" }),
    ).not.toThrow();
  });

  it("trims surrounding whitespace on required fields", () => {
    const config = defineCmssyConfig({
      workspaceSlug: "  acme  ",
      draftSecret: "\tshhh\n",
    });
    expect(config.workspaceSlug).toBe("acme");
    expect(config.draftSecret).toBe("shhh");
  });

  it("treats a non-string required value as missing (JS callers)", () => {
    expect(() =>
      defineCmssyConfig({
        // @ts-expect-error simulate a JS caller passing a non-string
        workspaceSlug: 123,
        draftSecret: "shhh",
      }),
    ).toThrowError(/CMSSY_WORKSPACE_SLUG/);
  });
});
