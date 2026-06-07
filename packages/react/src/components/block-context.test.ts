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
});
