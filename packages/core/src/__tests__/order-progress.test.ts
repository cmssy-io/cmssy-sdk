import { describe, expect, it } from "vitest";

import {
  orderProgress,
  orderProgressValues,
  type CmssyOrderProgressInput,
} from "../order-progress";
import type { CmssyWebhookOrder } from "../verify-webhook";

function order(
  overrides: Partial<CmssyOrderProgressInput> = {},
): CmssyOrderProgressInput {
  return {
    state: "open",
    paymentStatus: "unpaid",
    fulfillmentStatus: "unfulfilled",
    deliveryStatus: "none",
    shipments: [],
    ...overrides,
  };
}

describe("orderProgress: one step a buyer reads", () => {
  it("names the seven steps", () => {
    expect([...orderProgressValues]).toEqual([
      "placed",
      "paid",
      "shipped",
      "out_for_delivery",
      "delivered",
      "refunded",
      "canceled",
    ]);
  });

  it("is placed until money arrives", () => {
    expect(orderProgress(order())).toBe("placed");
    expect(orderProgress(order({ paymentStatus: "partially_paid" }))).toBe(
      "placed",
    );
  });

  it.each(["paid", "partially_refunded"])(
    "is paid once %s and nothing has left",
    (paymentStatus) => {
      expect(orderProgress(order({ paymentStatus }))).toBe("paid");
    },
  );

  it.each([
    ["fulfillmentStatus", "fulfilled"],
    ["fulfillmentStatus", "partially_fulfilled"],
    ["deliveryStatus", "in_transit"],
    ["deliveryStatus", "partially_delivered"],
  ])("is shipped when %s is %s", (axis, value) => {
    expect(orderProgress(order({ paymentStatus: "paid", [axis]: value }))).toBe(
      "shipped",
    );
  });

  it("is out for delivery when any parcel is with the courier, ahead of shipped", () => {
    expect(
      orderProgress(
        order({
          fulfillmentStatus: "fulfilled",
          deliveryStatus: "in_transit",
          shipments: [{ status: "in_transit" }, { status: "out_for_delivery" }],
        }),
      ),
    ).toBe("out_for_delivery");
  });

  it("is delivered once every parcel arrived, whatever a parcel's stale step", () => {
    expect(
      orderProgress(
        order({
          paymentStatus: "paid",
          fulfillmentStatus: "fulfilled",
          deliveryStatus: "delivered",
          shipments: [{ status: "out_for_delivery" }],
        }),
      ),
    ).toBe("delivered");
  });

  it("is refunded when all the money went back, even after delivery", () => {
    expect(
      orderProgress(
        order({ paymentStatus: "refunded", deliveryStatus: "delivered" }),
      ),
    ).toBe("refunded");
  });

  it("is canceled above everything else", () => {
    expect(
      orderProgress(
        order({
          state: "canceled",
          paymentStatus: "refunded",
          deliveryStatus: "delivered",
        }),
      ),
    ).toBe("canceled");
  });

  it("reads a closed order by its facts, not as canceled", () => {
    expect(
      orderProgress(
        order({
          state: "closed",
          paymentStatus: "paid",
          fulfillmentStatus: "fulfilled",
          deliveryStatus: "delivered",
        }),
      ),
    ).toBe("delivered");
  });

  it("takes an order without a shipments list", () => {
    expect(
      orderProgress(order({ paymentStatus: "paid", shipments: null })),
    ).toBe("paid");
  });

  it("takes the delivery API's order and a webhook's order as they come", () => {
    const delivery = {
      __typename: "PublicOrder" as const,
      id: "o-1",
      state: "open",
      paymentStatus: "paid",
      fulfillmentStatus: "partially_fulfilled",
      deliveryStatus: "partially_delivered",
      shipments: [{ status: "delivered", trackingNumber: "1" }],
    };
    const webhook: CmssyWebhookOrder = {
      id: "o-2",
      workspaceId: "ws-1",
      paymentStatus: "paid",
      fulfillmentStatus: "fulfilled",
      deliveryStatus: "delivered",
      state: "closed",
      fulfilledAt: "2026-10-01T00:00:00.000Z",
      deliveredAt: "2026-10-03T00:00:00.000Z",
      closedAt: "2026-10-03T00:00:00.000Z",
      total: 100,
      currency: "PLN",
      customerId: null,
      customerEmail: "b@example.com",
      paymentProvider: null,
      paymentReference: null,
      refundedAmount: 0,
      shipments: [
        {
          id: "s-1",
          carrier: null,
          trackingNumber: null,
          trackingUrl: null,
          labelUrl: null,
          status: "delivered",
          items: [],
          shippedAt: "2026-10-01T00:00:00.000Z",
          deliveredAt: "2026-10-03T00:00:00.000Z",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-03T00:00:00.000Z",
        },
      ],
      createdAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-10-03T00:00:00.000Z",
    };
    expect(orderProgress(delivery)).toBe("shipped");
    expect(orderProgress(webhook)).toBe("delivered");
  });
});
