import { describe, expect, it } from "vitest";
import { mintCmssyEditToken, verifyCmssyEditToken } from "../edit-token";

const SECRET = "draft-secret-at-least-16-chars";
const NOW = 1_700_000_000_000;

describe("mintCmssyEditToken / verifyCmssyEditToken", () => {
  it("accepts the token it minted for that page", async () => {
    const token = await mintCmssyEditToken(SECRET, { page: "/shop", now: NOW });
    await expect(
      verifyCmssyEditToken(token, SECRET, { page: "/shop", now: NOW + 1000 }),
    ).resolves.toBe(true);
  });

  it("refuses a token minted for a different page", async () => {
    const token = await mintCmssyEditToken(SECRET, { page: "/shop", now: NOW });
    await expect(
      verifyCmssyEditToken(token, SECRET, { page: "/pricing", now: NOW }),
    ).resolves.toBe(false);
  });

  it("refuses a token signed with a different secret", async () => {
    const token = await mintCmssyEditToken(SECRET, { page: "/shop", now: NOW });
    await expect(
      verifyCmssyEditToken(token, "some-other-draft-secret", {
        page: "/shop",
        now: NOW,
      }),
    ).resolves.toBe(false);
  });

  it("refuses a token past its expiry", async () => {
    const token = await mintCmssyEditToken(SECRET, {
      page: "/shop",
      ttlSeconds: 60,
      now: NOW,
    });
    await expect(
      verifyCmssyEditToken(token, SECRET, { page: "/shop", now: NOW + 61_000 }),
    ).resolves.toBe(false);
  });

  it("refuses an expiry moved forward without re-signing", async () => {
    const token = await mintCmssyEditToken(SECRET, {
      page: "/shop",
      ttlSeconds: 60,
      now: NOW,
    });
    const signature = token.slice(token.indexOf(".") + 1);
    const forged = `${NOW + 999_999_999}.${signature}`;

    await expect(
      verifyCmssyEditToken(forged, SECRET, { page: "/shop", now: NOW }),
      "the expiry is signed, so moving it invalidates the signature",
    ).resolves.toBe(false);
  });

  it.each([
    ["nothing", ""],
    ["null", null],
    ["undefined", undefined],
    ["no separator", "deadbeef"],
    ["a non-numeric expiry", "later.deadbeef"],
    ["no signature", `${NOW + 1000}.`],
    ["something absurdly long", `${NOW + 1000}.${"a".repeat(300)}`],
  ])("refuses %s", async (_label, token) => {
    await expect(
      verifyCmssyEditToken(token, SECRET, { page: "/shop", now: NOW }),
    ).resolves.toBe(false);
  });

  it("refuses everything when the app has no draftSecret", async () => {
    const token = await mintCmssyEditToken(SECRET, { page: "/shop", now: NOW });
    await expect(
      verifyCmssyEditToken(token, "", { page: "/shop", now: NOW }),
    ).resolves.toBe(false);
  });

  it("will not mint without a secret rather than minting something forgeable", async () => {
    await expect(mintCmssyEditToken("", { page: "/shop" })).rejects.toThrow(
      /draftSecret/,
    );
  });
});
