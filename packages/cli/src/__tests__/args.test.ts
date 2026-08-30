import { describe, expect, it } from "vitest";

import { flagValue, hasFlag } from "../args";

describe("flagValue", () => {
  it("reads --flag value and --flag=value", () => {
    expect(flagValue(["--blocks", "lib/x.ts"], "--blocks")).toBe("lib/x.ts");
    expect(flagValue(["--blocks=lib/x.ts"], "--blocks")).toBe("lib/x.ts");
    expect(flagValue(["--dry-run"], "--blocks")).toBeUndefined();
  });

  it("refuses a trailing flag with no value instead of silently falling back", () => {
    expect(() => flagValue(["--dry-run", "--blocks"], "--blocks")).toThrow(
      "--blocks needs a value",
    );
  });

  it("refuses a flag whose value is the next flag", () => {
    expect(() => flagValue(["--blocks", "--dry-run"], "--blocks")).toThrow(
      "--blocks needs a value",
    );
  });

  it("hasFlag", () => {
    expect(hasFlag(["--dry-run"], "--dry-run")).toBe(true);
    expect(hasFlag([], "--dry-run")).toBe(false);
  });
});
