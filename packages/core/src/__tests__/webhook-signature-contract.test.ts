import { describe, it, expect } from "vitest";
import { verifyCmssyWebhook, CmssyWebhookError } from "../verify-webhook";

const VECTOR = {
  secret: "cmssy-signature-contract-secret",
  timestamp: 1_700_000_000_000,
  body: '{"id":"3f2b9c14-0000-4000-8000-000000000001","event":"content.changed","createdAt":"2023-11-14T22:13:20.000Z","data":{"workspaceId":"695a526b09373a29a6c4a082"}}',
  signature: "6ba056d55c4e9ddc5ab105572f9e11c99501c345dc2a1af41a2d577a81b81993",
} as const;

const OTHER_SIGNATURE = "a".repeat(64);

function header(...signatures: string[]): string {
  return [`t=${VECTOR.timestamp}`, ...signatures.map((s) => `v1=${s}`)].join(
    ",",
  );
}

function verify(signatureHeader: string, body: string = VECTOR.body) {
  return verifyCmssyWebhook({
    body,
    signatureHeader,
    secret: VECTOR.secret,
    now: VECTOR.timestamp,
  });
}

describe("webhook signature contract - frozen vector, mirrored in cmssy backend, never recompute to make a test pass (CMS-1124)", () => {
  it("accepts the signature cmssy produces for the frozen vector", async () => {
    await expect(verify(header(VECTOR.signature))).resolves.toMatchObject({
      id: "3f2b9c14-0000-4000-8000-000000000001",
      event: "content.changed",
    });
  });

  it("rejects the frozen signature against a body changed by one byte", async () => {
    const tampered = VECTOR.body.replace("content.changed", "content.chan9ed");

    await expect(verify(header(VECTOR.signature), tampered)).rejects.toThrow(
      CmssyWebhookError,
    );
  });

  it("accepts the frozen signature wherever it sits in a rotation header", async () => {
    await expect(
      verify(header(VECTOR.signature, OTHER_SIGNATURE)),
    ).resolves.toBeTruthy();
    await expect(
      verify(header(OTHER_SIGNATURE, VECTOR.signature)),
    ).resolves.toBeTruthy();
  });
});
