import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyCmssyWebhook, CmssyWebhookError } from "../verify-webhook";

const SECRET = "s".repeat(64);

function sign(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

function makeBody(): string {
  return JSON.stringify({
    id: "wh_123",
    event: "order.paid",
    createdAt: "2026-06-13T00:00:00.000Z",
    data: {
      workspaceId: "ws1",
      order: {
        id: "o1",
        workspaceId: "ws1",
        displayStatus: "paid",
        paymentStatus: "paid",
        fulfillmentStatus: "unfulfilled",
        total: 1000,
        currency: "PLN",
        customerId: null,
        customerEmail: "b@example.com",
        paymentProvider: "stripe",
        paymentReference: "pi_1",
        refundedAmount: 0,
        createdAt: "2026-06-13T00:00:00.000Z",
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    },
  });
}

describe("verifyCmssyWebhook", () => {
  const now = 1_700_000_000_000;

  it("accepts a valid signature and returns the typed event", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(SECRET, now, body)}`;
    const event = await verifyCmssyWebhook({
      body,
      signatureHeader: header,
      secret: SECRET,
      now,
    });
    expect(event.event).toBe("order.paid");
    expect(event.id).toBe("wh_123");
    expect(event.data.order.paymentStatus).toBe("paid");
  });

  it("ignores header part order and extra parts", async () => {
    const body = makeBody();
    const header = `v1=${sign(SECRET, now, body)},t=${now},foo=bar`;
    await expect(
      verifyCmssyWebhook({
        body,
        signatureHeader: header,
        secret: SECRET,
        now,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects a tampered body", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(SECRET, now, body)}`;
    await expect(
      verifyCmssyWebhook({
        body: body.replace('"total":1000', '"total":1'),
        signatureHeader: header,
        secret: SECRET,
        now,
      }),
    ).rejects.toThrow(CmssyWebhookError);
  });

  it("rejects a wrong secret", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(SECRET, now, body)}`;
    await expect(
      verifyCmssyWebhook({
        body,
        signatureHeader: header,
        secret: "x".repeat(64),
        now,
      }),
    ).rejects.toThrow(/signature mismatch/i);
  });

  it("rejects a tampered timestamp (signature no longer matches)", async () => {
    const body = makeBody();
    const header = `t=${now + 1},v1=${sign(SECRET, now, body)}`;
    await expect(
      verifyCmssyWebhook({
        body,
        signatureHeader: header,
        secret: SECRET,
        now,
      }),
    ).rejects.toThrow(/signature mismatch/i);
  });

  it("rejects a stale timestamp outside tolerance", async () => {
    const body = makeBody();
    const stale = now - 10 * 60 * 1000; // 10 min old
    const header = `t=${stale},v1=${sign(SECRET, stale, body)}`;
    await expect(
      verifyCmssyWebhook({
        body,
        signatureHeader: header,
        secret: SECRET,
        now,
      }),
    ).rejects.toThrow(/tolerance/i);
  });

  it("rejects a missing or malformed header", async () => {
    const body = makeBody();
    await expect(
      verifyCmssyWebhook({ body, signatureHeader: null, secret: SECRET, now }),
    ).rejects.toThrow(/missing/i);
    await expect(
      verifyCmssyWebhook({
        body,
        signatureHeader: "garbage",
        secret: SECRET,
        now,
      }),
    ).rejects.toThrow(/malformed/i);
  });

  it("rejects an invalid-hex signature without throwing a RangeError", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${"z".repeat(64)}`;
    await expect(
      verifyCmssyWebhook({
        body,
        signatureHeader: header,
        secret: SECRET,
        now,
      }),
    ).rejects.toThrow(CmssyWebhookError);
  });

  it("rejects an empty secret", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(SECRET, now, body)}`;
    await expect(
      verifyCmssyWebhook({ body, signatureHeader: header, secret: "", now }),
    ).rejects.toThrow(/secret/i);
  });
});
