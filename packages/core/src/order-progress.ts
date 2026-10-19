export const orderProgressValues = [
  "placed",
  "paid",
  "shipped",
  "out_for_delivery",
  "delivered",
  "refunded",
  "canceled",
] as const;

export type CmssyOrderProgress = (typeof orderProgressValues)[number];

export interface CmssyOrderProgressInput {
  state: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  deliveryStatus: string;
  shipments?: ReadonlyArray<{ status: string }> | null;
}

const PAID: ReadonlySet<string> = new Set(["paid", "partially_refunded"]);
const SHIPPED_FULFILLMENT: ReadonlySet<string> = new Set([
  "fulfilled",
  "partially_fulfilled",
]);
const SHIPPED_DELIVERY: ReadonlySet<string> = new Set([
  "in_transit",
  "partially_delivered",
]);

export function orderProgress(
  order: CmssyOrderProgressInput,
): CmssyOrderProgress {
  if (order.state === "canceled") return "canceled";
  if (order.paymentStatus === "refunded") return "refunded";
  if (order.deliveryStatus === "delivered") return "delivered";
  if ((order.shipments ?? []).some((s) => s.status === "out_for_delivery")) {
    return "out_for_delivery";
  }
  if (
    SHIPPED_FULFILLMENT.has(order.fulfillmentStatus) ||
    SHIPPED_DELIVERY.has(order.deliveryStatus)
  ) {
    return "shipped";
  }
  if (PAID.has(order.paymentStatus)) return "paid";
  return "placed";
}
