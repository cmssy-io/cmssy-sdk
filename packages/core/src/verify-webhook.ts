import type {
  CmssyWebhookOrder,
  CmssyWebhookEvent,
  VerifyCmssyWebhookOptions,
} from "@cmssy/types";

export type { CmssyWebhookOrder, CmssyWebhookEvent, VerifyCmssyWebhookOptions };

export class CmssyWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmssyWebhookError";
  }
}

const DEFAULT_TOLERANCE_SECONDS = 300;

const MAX_SIGNATURES = 8;

function parseSignatureHeader(header: string): {
  timestamp: number;
  signatures: string[];
} {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t") timestamp = Number(value);
    else if (key === "v1" && value && signatures.length < MAX_SIGNATURES) {
      signatures.push(value);
    }
  }
  if (timestamp === null || !Number.isFinite(timestamp) || !signatures.length) {
    throw new CmssyWebhookError("Malformed X-Cmssy-Signature header");
  }
  return { timestamp, signatures };
}

function hexToBytes(hex: string): Uint8Array | null {
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
  if (expectedHex.length !== providedHex.length) return false;
  const expected = hexToBytes(expectedHex);
  const provided = hexToBytes(providedHex);
  if (!expected || !provided) {
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

export async function verifyCmssyWebhook(
  options: VerifyCmssyWebhookOptions,
): Promise<CmssyWebhookEvent> {
  const { body, signatureHeader, secret } = options;
  if (!signatureHeader) {
    throw new CmssyWebhookError("Missing X-Cmssy-Signature header");
  }
  const candidates =
    typeof secret === "string" ? [secret] : Array.isArray(secret) ? secret : [];
  if (candidates.some((value) => typeof value !== "string")) {
    throw new CmssyWebhookError("Webhook secret must be a string");
  }
  const secrets = candidates.filter(Boolean);
  if (!secrets.length) {
    throw new CmssyWebhookError("Missing webhook secret");
  }

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);

  const toleranceMs =
    (options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS) * 1000;
  const now = options.now ?? Date.now();
  if (Math.abs(now - timestamp) > toleranceMs) {
    throw new CmssyWebhookError("Webhook timestamp outside tolerance");
  }

  let matched = false;
  for (const candidate of secrets) {
    const expected = await hmacSha256Hex(candidate, `${timestamp}.${body}`);
    for (const signature of signatures) {
      if (timingSafeHexEqual(expected, signature)) matched = true;
    }
  }
  if (!matched) {
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
