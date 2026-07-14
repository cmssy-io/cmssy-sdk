import { describe, expect, it } from "vitest";
import { cmssySecretsMatch } from "../secret-match";

describe("cmssySecretsMatch", () => {
  it("matches equal secrets", async () => {
    expect(
      await cmssySecretsMatch("draft-secret-1234", "draft-secret-1234"),
    ).toBe(true);
  });

  it("rejects different secrets", async () => {
    expect(
      await cmssySecretsMatch("draft-secret-1234", "other-secret-9999"),
    ).toBe(false);
    expect(
      await cmssySecretsMatch("draft-secret-1234", "draft-secret-123"),
    ).toBe(false);
  });

  it("rejects oversized input without hashing (DoS guard)", async () => {
    const huge = "x".repeat(1_000_000);
    expect(await cmssySecretsMatch(huge, "draft-secret-1234")).toBe(false);
    expect(await cmssySecretsMatch("draft-secret-1234", huge)).toBe(false);
    expect(await cmssySecretsMatch(huge, huge)).toBe(false);
  });
});
