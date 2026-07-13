import { createHmac, timingSafeEqual } from "crypto";
import type {
  CmssyWebhookOrder,
  CmssyWebhookEvent,
  VerifyCmssyWebhookOptions,
} from "@cmssy/types";

// Webhook data shapes live in @cmssy/types; re-exported for consumers.
export type { CmssyWebhookOrder, CmssyWebhookEvent, VerifyCmssyWebhookOptions };

/**
 * Verify + parse an inbound cmssy webhook (CMS-693 / CMS-694).
 *
 * cmssy signs each delivery with HMAC-SHA256 over `${timestamp}.${body}`
 * and sends the result in the `X-Cmssy-Signature: t=<ms>,v1=<hex>`
 * header, plus a unique `X-Cmssy-Webhook-Id`. This helper recomputes the
 * signature (timing-safe compare), rejects stale timestamps to bound
 * replay, and returns the typed event.
 *
 * IMPORTANT: pass the RAW request body string (e.g. `await req.text()`),
 * never a re-serialized object - the signed bytes must match exactly.
 */

export class CmssyWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmssyWebhookError";
  }
}

const DEFAULT_TOLERANCE_SECONDS = 300;

function parseSignatureHeader(header: string): {
  timestamp: number;
  signature: string;
} {
  // Format: "t=<ms>,v1=<hex>" (order-independent, extra parts ignored).
  let timestamp: number | null = null;
  let signature: string | null = null;
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t") timestamp = Number(value);
    else if (key === "v1") signature = value;
  }
  if (timestamp === null || !Number.isFinite(timestamp) || !signature) {
    throw new CmssyWebhookError("Malformed X-Cmssy-Signature header");
  }
  return { timestamp, signature };
}

function timingSafeHexEqual(expectedHex: string, providedHex: string): boolean {
  // Decode first, then compare BUFFER lengths: an attacker-supplied v1
  // with odd/invalid hex decodes to a shorter buffer, and timingSafeEqual
  // throws on a length mismatch. Comparing decoded lengths (not hex string
  // lengths) keeps the throw from escaping as a non-CmssyWebhookError.
  const expected = Buffer.from(expectedHex, "hex");
  const provided = Buffer.from(providedHex, "hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/**
 * Verify the signature + freshness and return the parsed event. Throws
 * `CmssyWebhookError` on any failure (missing/malformed header, bad
 * signature, stale timestamp, invalid JSON) - catch it and respond 400.
 */
export function verifyCmssyWebhook(
  options: VerifyCmssyWebhookOptions,
): CmssyWebhookEvent {
  const { body, signatureHeader, secret } = options;
  if (!signatureHeader) {
    throw new CmssyWebhookError("Missing X-Cmssy-Signature header");
  }
  if (!secret) {
    throw new CmssyWebhookError("Missing webhook secret");
  }

  const { timestamp, signature } = parseSignatureHeader(signatureHeader);

  const toleranceMs =
    (options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS) * 1000;
  const now = options.now ?? Date.now();
  if (Math.abs(now - timestamp) > toleranceMs) {
    throw new CmssyWebhookError("Webhook timestamp outside tolerance");
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  if (!timingSafeHexEqual(expected, signature)) {
    throw new CmssyWebhookError("Webhook signature mismatch");
  }

  let parsed: CmssyWebhookEvent;
  try {
    parsed = JSON.parse(body) as CmssyWebhookEvent;
  } catch {
    throw new CmssyWebhookError("Webhook body is not valid JSON");
  }
  return parsed;
}
