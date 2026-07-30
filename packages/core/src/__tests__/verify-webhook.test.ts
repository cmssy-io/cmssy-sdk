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
    const stale = now - 10 * 60 * 1000;
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

describe("rotation overlap (CMS-1111)", () => {
  const now = 1_700_000_000_000;
  const OLD = "o".repeat(64);
  const NEW = "n".repeat(64);

  it("accepts a delivery signed with the previous secret while the consumer holds both", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(NEW, now, body)},v1=${sign(OLD, now, body)}`;

    const event = await verifyCmssyWebhook({
      body,
      signatureHeader: header,
      secret: [NEW, OLD],
      now,
    });

    expect(event.event).toBe("order.paid");
  });

  it("accepts when the consumer holds only the new secret and the delivery carries both", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(NEW, now, body)},v1=${sign(OLD, now, body)}`;

    await expect(
      verifyCmssyWebhook({ body, signatureHeader: header, secret: NEW, now }),
    ).resolves.toBeDefined();
  });

  it("accepts when the consumer holds only the previous secret", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(OLD, now, body)},v1=${sign(NEW, now, body)}`;

    await expect(
      verifyCmssyWebhook({ body, signatureHeader: header, secret: OLD, now }),
    ).resolves.toBeDefined();
  });

  it("rejects when no secret matches any signature", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(NEW, now, body)},v1=${sign(OLD, now, body)}`;

    await expect(
      verifyCmssyWebhook({
        body,
        signatureHeader: header,
        secret: ["x".repeat(64), "y".repeat(64)],
        now,
      }),
    ).rejects.toThrow(CmssyWebhookError);
  });

  it("keeps checking the remaining signatures past a malformed one", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(OLD, now, body)},v1=zzzz`;

    await expect(
      verifyCmssyWebhook({ body, signatureHeader: header, secret: OLD, now }),
    ).resolves.toBeDefined();
  });

  it("rejects an empty secret list rather than accepting anything", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(OLD, now, body)}`;

    await expect(
      verifyCmssyWebhook({ body, signatureHeader: header, secret: [], now }),
    ).rejects.toThrow(/Missing webhook secret/);
  });

  it("rejects a missing secret as a webhook error, not a TypeError", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(OLD, now, body)}`;

    for (const secret of [undefined, null]) {
      await expect(
        verifyCmssyWebhook({
          body,
          signatureHeader: header,
          secret: secret as unknown as string,
          now,
        }),
      ).rejects.toThrow(CmssyWebhookError);
    }
  });

  it("refuses a non-string secret instead of hashing its stringification", async () => {
    const body = makeBody();
    const forged = `t=${now},v1=${sign("[object Object]", now, body)}`;

    await expect(
      verifyCmssyWebhook({
        body,
        signatureHeader: forged,
        secret: [{} as unknown as string],
        now,
      }),
    ).rejects.toThrow(/must be a string/);
  });

  it("treats a list of empty strings as no secret at all", async () => {
    const body = makeBody();
    const header = `t=${now},v1=${sign(OLD, now, body)}`;

    await expect(
      verifyCmssyWebhook({ body, signatureHeader: header, secret: ["", ""], now }),
    ).rejects.toThrow(/Missing webhook secret/);
  });
});
