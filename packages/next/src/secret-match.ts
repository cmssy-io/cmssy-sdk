// Constant-time secret comparison built on Web Crypto so it runs in both the
// Node runtime (route handlers, server components) and the Edge runtime
// (middleware). Hashing both inputs first makes the byte comparison
// length-independent.
export async function cmssySecretsMatch(
  a: string,
  b: string,
): Promise<boolean> {
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
