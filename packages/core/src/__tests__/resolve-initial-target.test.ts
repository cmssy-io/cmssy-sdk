// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { resolveInitialTarget } from "../bridge/messages";

function setReferrer(value: string) {
  Object.defineProperty(document, "referrer", {
    value,
    configurable: true,
  });
}

describe("resolveInitialTarget", () => {
  afterEach(() => setReferrer(""));

  it("returns the single configured origin", () => {
    expect(resolveInitialTarget("https://cmssy.io")).toBe("https://cmssy.io");
  });

  it("returns '*' when the wildcard is allowed", () => {
    expect(resolveInitialTarget(["https://cmssy.io", "*"])).toBe("*");
  });

  it("treats a whitespace-padded wildcard as the wildcard", () => {
    expect(resolveInitialTarget([" * ", "https://cmssy.io"])).toBe("*");
  });

  it("normalizes the returned origin (strips path/whitespace)", () => {
    expect(resolveInitialTarget(" https://cmssy.io/editor ")).toBe(
      "https://cmssy.io",
    );
  });

  it("locks onto the referrer origin even when it is not first", () => {
    setReferrer("https://www.cmssy.io/dashboard/editor");
    expect(
      resolveInitialTarget(["https://cmssy.io", "https://www.cmssy.io"]),
    ).toBe("https://www.cmssy.io");
  });

  it("matches the referrer despite whitespace in the configured list", () => {
    setReferrer("https://www.cmssy.io/dashboard");
    expect(
      resolveInitialTarget(["https://cmssy.io", " https://www.cmssy.io "]),
    ).toBe("https://www.cmssy.io");
  });

  it("falls back to the first origin when there is no referrer", () => {
    setReferrer("");
    expect(
      resolveInitialTarget(["https://cmssy.io", "https://www.cmssy.io"]),
    ).toBe("https://cmssy.io");
  });

  it("falls back to the first origin when the referrer is not allowed", () => {
    setReferrer("https://evil.com/x");
    expect(
      resolveInitialTarget(["https://cmssy.io", "https://www.cmssy.io"]),
    ).toBe("https://cmssy.io");
  });
});
