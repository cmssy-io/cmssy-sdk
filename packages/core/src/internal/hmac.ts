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

export function timingSafeHexEqual(
  expectedHex: string,
  providedHex: string,
): boolean {
  if (expectedHex.length !== providedHex.length) return false;
  const expected = hexToBytes(expectedHex);
  const provided = hexToBytes(providedHex);
  if (!expected || !provided) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= (expected[i] ?? 0) ^ (provided[i] ?? 0);
  }
  return diff === 0;
}

export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
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
