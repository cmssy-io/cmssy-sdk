import { afterEach, describe, expect, it, vi } from "vitest";
import { defineCmssyConfig } from "../config";

describe("defineCmssyConfig", () => {
  it("passes env-shaped values through when required fields are present", () => {
    const config = defineCmssyConfig({
      apiUrl: process.env.CMSSY_API_URL,
      org: "acme-org",
      workspaceSlug: "acme",
      draftSecret: "shhh",
      devToken: undefined,
    });
    expect(config.org).toBe("acme-org");
    expect(config.workspaceSlug).toBe("acme");
    expect(config.draftSecret).toBe("shhh");
  });

  it("throws listing missing required env vars", () => {
    expect(() =>
      defineCmssyConfig({
        org: undefined,
        workspaceSlug: undefined,
        draftSecret: undefined,
      }),
    ).toThrowError(/CMSSY_ORG_SLUG.*CMSSY_WORKSPACE_SLUG.*CMSSY_DRAFT_SECRET/s);
  });

  it("treats blank/whitespace values as missing", () => {
    expect(() =>
      defineCmssyConfig({ workspaceSlug: "acme", draftSecret: "   " }),
    ).toThrowError(/CMSSY_DRAFT_SECRET/);
  });

  it("requires the org slug", () => {
    expect(() =>
      defineCmssyConfig({ workspaceSlug: "acme", draftSecret: "shhh" }),
    ).toThrowError(/CMSSY_ORG_SLUG/);
  });

  it("does not require the optional apiUrl", () => {
    expect(() =>
      defineCmssyConfig({
        org: "acme-org",
        workspaceSlug: "acme",
        draftSecret: "shhh",
      }),
    ).not.toThrow();
  });

  it("trims surrounding whitespace on required fields", () => {
    const config = defineCmssyConfig({
      org: "  acme-org  ",
      workspaceSlug: "  acme  ",
      draftSecret: "\tshhh\n",
    });
    expect(config.org).toBe("acme-org");
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

describe("config evaluated in the browser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says it is an import problem, not a config problem", () => {
    // In the browser the server's env is never there, so "set your env vars"
    // sends the developer to fix something that is already correct. The real
    // mistake is a client component importing a value that reads the config.
    vi.stubGlobal("window", {});

    expect(() =>
      defineCmssyConfig({
        org: undefined,
        workspaceSlug: undefined,
        draftSecret: undefined,
      }),
    ).toThrow(/import problem, not a config problem/);
  });
});
