// Real draft secrets are short; anything longer is abuse, and both sides are
// bounded so an attacker can't burn CPU hashing megabyte query params.
const MAX_SECRET_LENGTH = 256;

// Constant-time secret comparison built on Web Crypto so it runs in both the
// Node runtime (route handlers, server components) and the Edge runtime
// (middleware). Hashing both inputs first makes the byte comparison
// length-independent.
export async function cmssySecretsMatch(
  a: string,
  b: string,
): Promise<boolean> {
  if (a.length > MAX_SECRET_LENGTH || b.length > MAX_SECRET_LENGTH) {
    return false;
  }
  const encoder = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i += 1) {
    diff |= (va[i] ?? 0) ^ (vb[i] ?? 0);
  }
  return diff === 0;
}
