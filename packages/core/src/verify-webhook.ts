import type {
  CmssyWebhookOrder,
  CmssyWebhookEvent,
  VerifyCmssyWebhookOptions,
} from "@cmssy/types";
import { hmacSha256Hex, timingSafeHexEqual } from "./internal/hmac";

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
