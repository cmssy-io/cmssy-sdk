import { hmacSha256Hex, timingSafeHexEqual } from "./internal/hmac";

export const CMSSY_EDIT_TOKEN_HEADER = "x-cmssy-edit-token";

const DEFAULT_TTL_SECONDS = 12 * 60 * 60;

const MAX_TOKEN_LENGTH = 256;

function payload(expiresAt: number, page: string): string {
  return `${expiresAt}.${page}`;
}

export interface MintCmssyEditTokenOptions {
  page?: string;
  ttlSeconds?: number;
  now?: number;
}

export async function mintCmssyEditToken(
  secret: string,
  options: MintCmssyEditTokenOptions = {},
): Promise<string> {
  if (!secret) {
    throw new Error("cmssy: minting an edit token needs a draftSecret");
  }
  const now = options.now ?? Date.now();
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const expiresAt = now + ttl * 1000;
  const signature = await hmacSha256Hex(
    secret,
    payload(expiresAt, options.page ?? ""),
  );
  return `${expiresAt}.${signature}`;
}

export interface VerifyCmssyEditTokenOptions {
  page?: string;
  now?: number;
}

export async function verifyCmssyEditToken(
  token: string | null | undefined,
  secret: string,
  options: VerifyCmssyEditTokenOptions = {},
): Promise<boolean> {
  if (!token || !secret) return false;
  if (token.length > MAX_TOKEN_LENGTH) return false;
  const separator = token.indexOf(".");
  if (separator === -1) return false;
  const expiresAt = Number(token.slice(0, separator));
  const provided = token.slice(separator + 1);
  if (!Number.isSafeInteger(expiresAt) || !provided) return false;
  const now = options.now ?? Date.now();
  if (expiresAt <= now) return false;
  const expected = await hmacSha256Hex(
    secret,
    payload(expiresAt, options.page ?? ""),
  );
  return timingSafeHexEqual(expected, provided);
}
