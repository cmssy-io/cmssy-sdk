import { describe, expect, it } from "vitest";
import { defineCmssyConfig } from "../config";

describe("defineCmssyConfig", () => {
  it("passes env-shaped values through when required fields are present", () => {
    const config = defineCmssyConfig({
      apiUrl: process.env.CMSSY_API_URL,
      workspaceSlug: "acme",
      draftSecret: "shhh",
      devToken: undefined,
      preview: undefined,
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
});
