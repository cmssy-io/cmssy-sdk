import { describe, it, expect } from "vitest";
import { buildBlockContext } from "./block-context";

describe("buildBlockContext", () => {
  it("uses the provided enabled locales", () => {
    const ctx = buildBlockContext("pl", "en", ["en", "pl", "de"]);
    expect(ctx.locale).toEqual({
      current: "pl",
      default: "en",
      enabled: ["en", "pl", "de"],
    });
  });

  it("falls back to current + default when enabled locales are omitted", () => {
    const ctx = buildBlockContext("fr", "en");
    expect(ctx.locale?.enabled).toEqual(["en", "fr"]);
  });

  it("dedupes the fallback when current equals default", () => {
    const ctx = buildBlockContext("en", "en", []);
    expect(ctx.locale?.enabled).toEqual(["en"]);
  });

  it("defaults isPreview to false and passes it through", () => {
    expect(buildBlockContext("en", "en").isPreview).toBe(false);
    expect(buildBlockContext("en", "en", undefined, true).isPreview).toBe(true);
  });

  it("omits auth, workspace and isDraftMode when no extra is provided", () => {
    const ctx = buildBlockContext("en", "en");
    expect("auth" in ctx).toBe(false);
    expect("workspace" in ctx).toBe(false);
    expect("isDraftMode" in ctx).toBe(false);
  });

  it("injects auth, workspace and isDraftMode from the extra argument", () => {
    const ctx = buildBlockContext("en", "en", undefined, false, undefined, {
      isDraftMode: true,
      auth: {
        isAuthenticated: true,
        member: { recordId: "rec_1", email: "a@b.com" },
      },
      workspace: { id: "ws_1", slug: "acme" },
    });
    expect(ctx.isDraftMode).toBe(true);
    expect(ctx.auth).toEqual({
      isAuthenticated: true,
      member: { recordId: "rec_1", email: "a@b.com" },
    });
    expect(ctx.workspace).toEqual({ id: "ws_1", slug: "acme" });
  });
});
