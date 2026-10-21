import { CmssyGraphqlError } from "./http";

export const checkoutErrorReasonValues = [
  "CART_REPRICED",
  "CART_CURRENCY_CHANGED",
] as const;

export type CmssyCheckoutErrorReason =
  (typeof checkoutErrorReasonValues)[number];

const REASONS: ReadonlySet<string> = new Set(checkoutErrorReasonValues);

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
