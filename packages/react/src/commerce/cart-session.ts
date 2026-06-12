export const CART_SESSION_STORAGE_KEY = "cmssy_cart_session";
export const CART_SESSION_HEADER = "x-cart-session";

const TOKEN_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function mintCartSessionToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function loadCartSessionToken(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const existing = window.localStorage.getItem(CART_SESSION_STORAGE_KEY);
  if (existing) return existing;
  const token = mintCartSessionToken();
  window.localStorage.setItem(CART_SESSION_STORAGE_KEY, token);
  return token;
}

export function clearCartSessionToken(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(CART_SESSION_STORAGE_KEY);
}

export function cartSessionHeaders(
  token: string | null,
): Record<string, string> {
  return token ? { [CART_SESSION_HEADER]: token } : {};
}
