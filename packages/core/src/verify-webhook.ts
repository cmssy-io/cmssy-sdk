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

function hexToBytes(hex: string): Uint8Array | null {
  // Invalid hex decodes to nothing rather than to a shorter buffer: a bad v1
  // must fail as a signature mismatch, not as a thrown length error.
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeHexEqual(expectedHex: string, providedHex: string): boolean {
  const expected = hexToBytes(expectedHex);
  const provided = hexToBytes(providedHex);
  if (!expected || !provided || expected.length !== provided.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= (expected[i] ?? 0) ^ (provided[i] ?? 0);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return bytesToHex(new Uint8Array(signature));
}

/**
 * Verify the signature + freshness and return the parsed event. Throws
 * `CmssyWebhookError` on any failure (missing/malformed header, bad
 * signature, stale timestamp, invalid JSON) - catch it and respond 400.
 */
export async function verifyCmssyWebhook(
  options: VerifyCmssyWebhookOptions,
): Promise<CmssyWebhookEvent> {
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

  const expected = await hmacSha256Hex(secret, `${timestamp}.${body}`);
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
