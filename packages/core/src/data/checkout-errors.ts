import { CmssyGraphqlError } from "./http";
import {
  priceWithheldReasonValues,
  type CmssyPriceWithheldReason,
} from "./public-prices";

export const quantityRuleReasonValues = [
  "QUANTITY_BELOW_MIN",
  "QUANTITY_ABOVE_MAX",
  "QUANTITY_NOT_ON_STEP",
] as const;

export type CmssyQuantityRuleReason = (typeof quantityRuleReasonValues)[number];

export const checkoutErrorReasonValues = [
  "CART_REPRICED",
  "CART_CURRENCY_CHANGED",
  "BUYER_CHANGED",
  "PRODUCT_NOT_SOLD",
  ...quantityRuleReasonValues,
] as const;

export type CmssyCheckoutErrorReason =
  (typeof checkoutErrorReasonValues)[number];

export interface CmssyQuantityRuleViolation {
  reason: CmssyQuantityRuleReason;
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  increment: number;
  itemId: string | null;
}

const REASONS: ReadonlySet<string> = new Set(checkoutErrorReasonValues);
const QUANTITY_REASONS: ReadonlySet<string> = new Set(quantityRuleReasonValues);

export function checkoutErrorReason(
  error: unknown,
): CmssyCheckoutErrorReason | undefined {
  if (!(error instanceof CmssyGraphqlError)) return undefined;
  for (const entry of error.errors) {
    const reason = entry.extensions?.reason;
    if (typeof reason === "string" && REASONS.has(reason)) {
      return reason as CmssyCheckoutErrorReason;
    }
  }
  return undefined;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function quantityRuleViolation(
  error: unknown,
): CmssyQuantityRuleViolation | undefined {
  if (!(error instanceof CmssyGraphqlError)) return undefined;
  for (const entry of error.errors) {
    const ext = entry.extensions;
    if (!ext || typeof ext.reason !== "string") continue;
    if (!QUANTITY_REASONS.has(ext.reason)) continue;
    const { quantity, minQuantity, maxQuantity, increment, itemId } = ext;
    if (
      !isCount(quantity) ||
      !isCount(minQuantity) ||
      !isCount(maxQuantity) ||
      !isCount(increment)
    ) {
      continue;
    }
    return {
      reason: ext.reason as CmssyQuantityRuleReason,
      quantity,
      minQuantity,
      maxQuantity,
      increment,
      itemId: typeof itemId === "string" ? itemId : null,
    };
  }
  return undefined;
}

export const channelRefusalReasonValues = [
  "UNKNOWN_CHANNEL",
  ...priceWithheldReasonValues,
] as const;

export type CmssyChannelRefusalReason =
  (typeof channelRefusalReasonValues)[number];

export interface CmssyChannelRefusal {
  reason: CmssyChannelRefusalReason;
  channel: string;
}

const WITHHELD_REASONS: ReadonlySet<string> = new Set(
  priceWithheldReasonValues,
);

export function channelRefusal(
  error: unknown,
): CmssyChannelRefusal | undefined {
  if (!(error instanceof CmssyGraphqlError)) return undefined;
  for (const entry of error.errors) {
    const ext = entry.extensions;
    if (!ext || typeof ext.channel !== "string") continue;
    if (typeof ext.reason === "string" && WITHHELD_REASONS.has(ext.reason)) {
      return {
        reason: ext.reason as CmssyPriceWithheldReason,
        channel: ext.channel,
      };
    }
    if (ext.code === "BAD_USER_INPUT" && ext.reason === undefined) {
      return { reason: "UNKNOWN_CHANNEL", channel: ext.channel };
    }
  }
  return undefined;
}
